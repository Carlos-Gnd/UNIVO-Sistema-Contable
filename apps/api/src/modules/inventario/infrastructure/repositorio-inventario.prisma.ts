import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type {
  MetodoValuacion,
  MovimientoParaKardex,
  SistemaInventario,
  CategoriaProducto,
  CrearCategoria,
  CrearProducto,
  EditarCategoria,
  EditarProducto,
  ProductoVista,
  ConsultaSeries,
  SerieInventarioVista,
  ProductoReabastecimientoVista,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  CategoriaDuplicadaError,
  CategoriaNoEncontradaError,
  CodigoProductoDuplicadoError,
  ProductoNoEncontradoError,
  ReglaProductoError,
  SerieDuplicadaError,
  type SerieParaSalida,
  type AccesoInventario,
  type DatosMovimiento,
  type FiltroProductos,
  type RepositorioInventario,
  type UnidadInventario,
} from "../domain/producto.js";
import {
  TomaFisicaAbiertaError,
  TomaFisicaNoEncontradaError,
  type CuentaTomaFisica,
  type DetalleTomaFisicaRegistro,
  type LineaPartidaTomaFisica,
  type TomaFisicaRegistro,
  type ValorFinalTomaFisica,
} from "../domain/toma-fisica.js";
import type { DatosInventarioAnalitico } from "../domain/inventario-analitico.js";

/** Índice único que violó la operación (P2002), o null si es otro error; Postgres recorta el nombre del índice. */
export function indiceDuplicado(error: unknown): "codigo" | "categoria" | null {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return null;
  const detalle = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  if (detalle.includes("productos_empresa_id_codigo")) return "codigo";
  if (detalle.includes("categorias_producto_empresa_id_nombre")) return "categoria";
  return null;
}

interface ProductoFila {
  id: string;
  codigo: string;
  nombre: string;
  categoriaId: string | null;
  unidadMedida: string;
  precioVenta: { toFixed(decimales: number): string };
  existenciaMinima: { toFixed(decimales: number): string };
  metodoValuacion: MetodoValuacion | null;
  controlaSeries: boolean;
  activo: boolean;
  categoria: { nombre: string } | null;
}

const aVista = (p: ProductoFila): ProductoVista => ({
  id: p.id,
  codigo: p.codigo,
  nombre: p.nombre,
  categoriaId: p.categoriaId,
  categoria: p.categoria?.nombre ?? null,
  unidadMedida: p.unidadMedida,
  precioVenta: p.precioVenta.toFixed(2),
  existenciaMinima: p.existenciaMinima.toFixed(4),
  metodoValuacion: p.metodoValuacion,
  controlaSeries: p.controlaSeries,
  activo: p.activo,
});

class UnidadPrisma implements UnidadInventario {
  constructor(private readonly tx: Tx) {}

  private async categoriaUsable(empresaId: string, categoriaId: string): Promise<void> {
    const c = await this.tx.categoriaProducto.findFirst({ where: { id: categoriaId, empresaId } });
    if (!c) throw new CategoriaNoEncontradaError();
    if (!c.activa) throw new ReglaProductoError(`La categoría «${c.nombre}» está inactiva.`);
  }

  async categorias(empresaId: string): Promise<CategoriaProducto[]> {
    const filas = await this.tx.categoriaProducto.findMany({
      where: { empresaId },
      orderBy: { nombre: "asc" },
      include: { _count: { select: { productos: true } } },
    });
    return filas.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      activa: c.activa,
      productos: c._count.productos,
    }));
  }

  async crearCategoria(empresaId: string, datos: CrearCategoria): Promise<CategoriaProducto> {
    try {
      const c = await this.tx.categoriaProducto.create({ data: { empresaId, nombre: datos.nombre } });
      return { id: c.id, nombre: c.nombre, activa: c.activa, productos: 0 };
    } catch (e) {
      if (indiceDuplicado(e) === "categoria") throw new CategoriaDuplicadaError(datos.nombre);
      throw e;
    }
  }

  async editarCategoria(
    empresaId: string,
    categoriaId: string,
    cambios: EditarCategoria,
  ): Promise<CategoriaProducto> {
    const existente = await this.tx.categoriaProducto.findFirst({ where: { id: categoriaId, empresaId } });
    if (!existente) throw new CategoriaNoEncontradaError();
    try {
      const c = await this.tx.categoriaProducto.update({
        where: { id: categoriaId },
        data: {
          ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
          ...(cambios.activa !== undefined ? { activa: cambios.activa } : {}),
        },
        include: { _count: { select: { productos: true } } },
      });
      return { id: c.id, nombre: c.nombre, activa: c.activa, productos: c._count.productos };
    } catch (e) {
      if (indiceDuplicado(e) === "categoria" && cambios.nombre)
        throw new CategoriaDuplicadaError(cambios.nombre);
      throw e;
    }
  }

  async productos(empresaId: string, filtro: FiltroProductos): Promise<ProductoVista[]> {
    const texto = filtro.busqueda?.trim();
    const filas = await this.tx.producto.findMany({
      where: {
        empresaId,
        ...(filtro.categoriaId ? { categoriaId: filtro.categoriaId } : {}),
        ...(filtro.activo !== undefined ? { activo: filtro.activo } : {}),
        ...(texto
          ? {
              OR: [
                { codigo: { contains: texto, mode: "insensitive" as const } },
                { nombre: { contains: texto, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { codigo: "asc" },
      include: { categoria: { select: { nombre: true } } },
    });
    return filas.map(aVista);
  }

  async producto(empresaId: string, productoId: string): Promise<ProductoVista> {
    const p = await this.tx.producto.findFirst({
      where: { id: productoId, empresaId },
      include: { categoria: { select: { nombre: true } } },
    });
    if (!p) throw new ProductoNoEncontradoError();
    return aVista(p);
  }

  async crearProducto(empresaId: string, datos: CrearProducto): Promise<ProductoVista> {
    if (datos.categoriaId) await this.categoriaUsable(empresaId, datos.categoriaId);
    try {
      const p = await this.tx.producto.create({
        data: {
          empresaId,
          codigo: datos.codigo,
          nombre: datos.nombre,
          categoriaId: datos.categoriaId ?? null,
          ...(datos.unidadMedida ? { unidadMedida: datos.unidadMedida } : {}),
          precioVenta: datos.precioVenta,
          existenciaMinima: datos.existenciaMinima,
          controlaSeries: datos.controlaSeries,
          ...(datos.metodoValuacion ? { metodoValuacion: datos.metodoValuacion } : {}),
        },
        include: { categoria: { select: { nombre: true } } },
      });
      return aVista(p);
    } catch (e) {
      if (indiceDuplicado(e) === "codigo") throw new CodigoProductoDuplicadoError(datos.codigo);
      throw e;
    }
  }

  async editarProducto(
    empresaId: string,
    productoId: string,
    cambios: EditarProducto,
  ): Promise<ProductoVista> {
    const actual = await this.tx.producto.findFirst({ where: { id: productoId, empresaId } });
    if (!actual) throw new ProductoNoEncontradoError();
    if (cambios.categoriaId && cambios.categoriaId !== actual.categoriaId) {
      await this.categoriaUsable(empresaId, cambios.categoriaId);
    }
    try {
      const p = await this.tx.producto.update({
        where: { id: productoId },
        data: {
          ...(cambios.codigo !== undefined ? { codigo: cambios.codigo } : {}),
          ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
          ...(cambios.categoriaId !== undefined ? { categoriaId: cambios.categoriaId } : {}),
          ...(cambios.unidadMedida !== undefined ? { unidadMedida: cambios.unidadMedida } : {}),
          ...(cambios.precioVenta !== undefined ? { precioVenta: cambios.precioVenta } : {}),
          ...(cambios.existenciaMinima !== undefined ? { existenciaMinima: cambios.existenciaMinima } : {}),
          ...(cambios.controlaSeries !== undefined ? { controlaSeries: cambios.controlaSeries } : {}),
          ...(cambios.metodoValuacion !== undefined ? { metodoValuacion: cambios.metodoValuacion } : {}),
          ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
        },
        include: { categoria: { select: { nombre: true } } },
      });
      return aVista(p);
    } catch (e) {
      if (indiceDuplicado(e) === "codigo" && cambios.codigo)
        throw new CodigoProductoDuplicadoError(cambios.codigo);
      const regla = mensajeDeRegla(e);
      if (regla) throw new ReglaProductoError(regla);
      throw e;
    }
  }

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoInventario | null> {
    const m = await this.tx.membresia.findFirst({
      where: { usuarioId, empresaId, activa: true },
      select: { todasSucursales: true, sucursales: { select: { sucursalId: true } } },
    });
    return m
      ? { todasSucursales: m.todasSucursales, sucursales: m.sucursales.map((s) => s.sucursalId) }
      : null;
  }

  async permisos(usuarioId: string, empresaId: string): Promise<readonly string[]> {
    const [fila] = await this.tx.$queryRaw<{ permisos: string[] }[]>`
      SELECT ARRAY(SELECT pu.permiso FROM permisos_usuario pu
                   WHERE pu.usuario_id = ${usuarioId}::uuid AND pu.empresa_id = ${empresaId}::uuid) AS permisos
      FROM membresias m JOIN usuarios u ON u.id = m.usuario_id AND u.activo
      WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa`;
    return fila?.permisos ?? [];
  }

  async crearTomaFisica(
    empresaId: string,
    sucursalId: string,
    fecha: string,
    usuarioId: string,
  ): Promise<string> {
    await this.tx.$queryRaw`
      SELECT p.id FROM productos p
      WHERE p.empresa_id = ${empresaId}::uuid AND p.activo
      ORDER BY p.id FOR UPDATE`;
    const [movimientoPosterior] = await this.tx.$queryRaw<{ fecha: string | null }[]>`
      SELECT to_char(max(m.fecha), 'YYYY-MM-DD') AS fecha
      FROM movimientos_inventario m
      JOIN productos p ON p.id = m.producto_id
      WHERE p.empresa_id = ${empresaId}::uuid AND p.activo AND m.sucursal_id = ${sucursalId}::uuid`;
    if (movimientoPosterior?.fecha && movimientoPosterior.fecha > fecha) {
      throw new ReglaProductoError(
        `La fecha del conteo debe ser igual o posterior al último movimiento (${movimientoPosterior.fecha}).`,
      );
    }
    const [toma] = await this.tx.$queryRaw<{ id: string }[]>`
      INSERT INTO tomas_fisicas (empresa_id, sucursal_id, fecha, creado_por)
      VALUES (${empresaId}::uuid, ${sucursalId}::uuid, ${fecha}::date, ${usuarioId}::uuid)
      ON CONFLICT (empresa_id, sucursal_id) WHERE estado = 'en_conteo' DO NOTHING
      RETURNING id::text`;
    if (!toma) throw new TomaFisicaAbiertaError();
    const insertados = await this.tx.$executeRaw`
      INSERT INTO tomas_fisicas_detalles
        (empresa_id, toma_fisica_id, producto_id, existencia_sistema, secuencia_sistema)
      SELECT ${empresaId}::uuid, ${toma.id}::uuid, p.id,
             coalesce(sum(CASE m.tipo WHEN 'entrada' THEN m.cantidad ELSE -m.cantidad END), 0),
             coalesce(max(m.secuencia), 0)
      FROM productos p
      LEFT JOIN movimientos_inventario m ON m.producto_id = p.id AND m.sucursal_id = ${sucursalId}::uuid
      WHERE p.empresa_id = ${empresaId}::uuid AND p.activo
      GROUP BY p.id`;
    if (insertados === 0)
      throw new ReglaProductoError("No hay productos activos para contar en esta empresa.");
    return toma.id;
  }

  async ultimaTomaFisica(empresaId: string, sucursalId: string): Promise<string | null> {
    const [toma] = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM tomas_fisicas
      WHERE empresa_id = ${empresaId}::uuid AND sucursal_id = ${sucursalId}::uuid
      ORDER BY (estado = 'en_conteo') DESC, creado_en DESC, id DESC
      LIMIT 1`;
    return toma?.id ?? null;
  }

  async leerTomaFisica(
    empresaId: string,
    tomaId: string,
    bloquear = false,
  ): Promise<TomaFisicaRegistro | null> {
    type Fila = {
      id: string;
      empresa_id: string;
      sucursal_id: string;
      fecha: string;
      estado: "en_conteo" | "aprobada";
      partida_id: string | null;
      creado_en: Date;
      aprobado_en: Date | null;
    };
    const filas = bloquear
      ? await this.tx.$queryRaw<Fila[]>`
          SELECT id::text, empresa_id::text, sucursal_id::text, to_char(fecha, 'YYYY-MM-DD') AS fecha,
                 estado::text, partida_id::text, creado_en, aprobado_en
          FROM tomas_fisicas
          WHERE id = ${tomaId}::uuid AND empresa_id = ${empresaId}::uuid
          FOR UPDATE`
      : await this.tx.$queryRaw<Fila[]>`
          SELECT id::text, empresa_id::text, sucursal_id::text, to_char(fecha, 'YYYY-MM-DD') AS fecha,
                 estado::text, partida_id::text, creado_en, aprobado_en
          FROM tomas_fisicas
          WHERE id = ${tomaId}::uuid AND empresa_id = ${empresaId}::uuid`;
    const toma = filas[0];
    if (!toma) return null;
    const detalles = await this.tx.$queryRaw<
      {
        producto_id: string;
        codigo: string;
        nombre: string;
        unidad_medida: string;
        controla_series: boolean;
        metodo_valuacion: "promedio_ponderado" | "peps" | null;
        existencia_sistema: string;
        secuencia_sistema: string;
        cantidad_contada: string | null;
        series_contadas: string[] | null;
        cantidad_faltante: string | null;
        cantidad_sobrante: string | null;
        valor_faltante: string | null;
        valor_sobrante: string | null;
        valor_final: string | null;
      }[]
    >`
      SELECT d.producto_id::text, p.codigo, p.nombre, p.unidad_medida, p.controla_series,
             p.metodo_valuacion::text, d.existencia_sistema::text, d.secuencia_sistema::text,
             d.cantidad_contada::text, d.series_contadas, d.cantidad_faltante::text,
             d.cantidad_sobrante::text, d.valor_faltante::text,
             d.valor_sobrante::text, d.valor_final::text
      FROM tomas_fisicas_detalles d
      JOIN productos p ON p.id = d.producto_id
      WHERE d.toma_fisica_id = ${tomaId}::uuid AND d.empresa_id = ${empresaId}::uuid
      ORDER BY p.codigo, p.id`;
    return {
      id: toma.id,
      empresaId: toma.empresa_id,
      sucursalId: toma.sucursal_id,
      fecha: toma.fecha,
      estado: toma.estado,
      partidaId: toma.partida_id,
      creadoEn: toma.creado_en,
      aprobadoEn: toma.aprobado_en,
      detalles: detalles.map((detalle): DetalleTomaFisicaRegistro => ({
        productoId: detalle.producto_id,
        codigo: detalle.codigo,
        nombre: detalle.nombre,
        unidadMedida: detalle.unidad_medida,
        controlaSeries: detalle.controla_series,
        metodoValuacion: detalle.metodo_valuacion,
        existenciaSistema: detalle.existencia_sistema,
        secuenciaSistema: detalle.secuencia_sistema,
        cantidadContada: detalle.cantidad_contada,
        seriesContadas: detalle.series_contadas,
        cantidadFaltante: detalle.cantidad_faltante,
        cantidadSobrante: detalle.cantidad_sobrante,
        valorFaltante: detalle.valor_faltante,
        valorSobrante: detalle.valor_sobrante,
        valorFinal: detalle.valor_final,
      })),
    };
  }

  async guardarConteoTomaFisica(
    empresaId: string,
    tomaId: string,
    lineas: readonly { productoId: string; cantidadContada: string; seriesContadas?: readonly string[] }[],
  ): Promise<void> {
    const toma = await this.leerTomaFisica(empresaId, tomaId, true);
    if (!toma) throw new TomaFisicaNoEncontradaError();
    if (toma.estado !== "en_conteo") throw new ReglaProductoError("La toma física ya está aprobada.");
    const productos = new Set(toma.detalles.map((detalle) => detalle.productoId));
    for (const linea of lineas) {
      if (!productos.has(linea.productoId)) {
        throw new ReglaProductoError("El producto no forma parte de esta toma física.");
      }
      const actualizadas = await this.tx.$executeRaw`
        UPDATE tomas_fisicas_detalles
        SET cantidad_contada = ${linea.cantidadContada}::numeric,
            series_contadas = ${linea.seriesContadas ? [...linea.seriesContadas] : []}::text[]
        WHERE empresa_id = ${empresaId}::uuid AND toma_fisica_id = ${tomaId}::uuid
          AND producto_id = ${linea.productoId}::uuid`;
      if (actualizadas !== 1) throw new ReglaProductoError("El producto no forma parte de esta toma física.");
    }
  }

  async ultimaSecuenciaMovimiento(productoId: string, sucursalId: string): Promise<bigint> {
    const [fila] = await this.tx.$queryRaw<{ secuencia: string }[]>`
      SELECT coalesce(max(secuencia), 0)::text AS secuencia
      FROM movimientos_inventario WHERE producto_id = ${productoId}::uuid AND sucursal_id = ${sucursalId}::uuid`;
    return BigInt(fila?.secuencia ?? "0");
  }

  async cuentasTomaFisica(empresaId: string, ids: readonly string[]): Promise<CuentaTomaFisica[]> {
    return this.tx.$queryRaw<CuentaTomaFisica[]>`
      SELECT c.id::text, c.codigo, c.activa,
             NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.cuenta_padre_id = c.id) AS imputable
      FROM cuentas c WHERE c.empresa_id = ${empresaId}::uuid AND c.id = ANY(${[...ids]}::uuid[])`;
  }

  async cuentaTomaFisicaPorCodigo(empresaId: string, codigo: string): Promise<CuentaTomaFisica | null> {
    const [cuenta] = await this.tx.$queryRaw<CuentaTomaFisica[]>`
      SELECT c.id::text, c.codigo, c.activa,
             NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.cuenta_padre_id = c.id) AS imputable
      FROM cuentas c WHERE c.empresa_id = ${empresaId}::uuid AND c.codigo = ${codigo}`;
    return cuenta ?? null;
  }

  async crearPartidaTomaFisica(
    empresaId: string,
    tomaId: string,
    sucursalId: string,
    fecha: string,
    lineas: readonly LineaPartidaTomaFisica[],
  ): Promise<string> {
    const [partida] = await this.tx.$queryRaw<{ id: string }[]>`
      INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
      VALUES (${empresaId}::uuid, ${sucursalId}::uuid, ${fecha}::date, 'ajuste',
              'Ajuste por toma física de inventario', 'toma_fisica', ${tomaId}::uuid)
      RETURNING id::text`;
    if (!partida) throw new Error("La base no devolvió el id de la partida de ajuste");
    await this.tx.$executeRaw`
      INSERT INTO partida_detalles (partida_id, cuenta_id, debe, haber, concepto, orden)
      SELECT ${partida.id}::uuid, l.cuenta_id, l.debe, l.haber, l.concepto, (l.n - 1)::smallint
      FROM unnest(${lineas.map((linea) => linea.cuentaId)}::uuid[],
                  ${lineas.map((linea) => linea.debe)}::numeric[],
                  ${lineas.map((linea) => linea.haber)}::numeric[],
                  ${lineas.map((linea) => linea.concepto)}::text[])
           WITH ORDINALITY AS l(cuenta_id, debe, haber, concepto, n)`;
    return partida.id;
  }

  async finalizarTomaFisica(
    empresaId: string,
    tomaId: string,
    partidaId: string | null,
    usuarioId: string,
    valores: readonly ValorFinalTomaFisica[],
  ): Promise<void> {
    const actualizadas = await this.tx.$executeRaw`
      UPDATE tomas_fisicas
      SET estado = 'aprobada', partida_id = ${partidaId}::uuid,
          aprobado_por = ${usuarioId}::uuid, aprobado_en = now()
      WHERE id = ${tomaId}::uuid AND empresa_id = ${empresaId}::uuid AND estado = 'en_conteo'`;
    if (actualizadas !== 1) throw new ReglaProductoError("La toma física ya fue aprobada.");
    for (const valor of valores) {
      const detalleActualizado = await this.tx.$executeRaw`
        UPDATE tomas_fisicas_detalles
        SET valor_faltante = ${valor.valorFaltante}::numeric,
            cantidad_faltante = ${valor.cantidadFaltante}::numeric,
            cantidad_sobrante = ${valor.cantidadSobrante}::numeric,
            valor_sobrante = ${valor.valorSobrante}::numeric,
            valor_final = ${valor.valorFinal}::numeric
        WHERE empresa_id = ${empresaId}::uuid AND toma_fisica_id = ${tomaId}::uuid
          AND producto_id = ${valor.productoId}::uuid`;
      if (detalleActualizado !== 1)
        throw new ReglaProductoError("Falta un producto en el detalle de la toma física.");
    }
  }

  async existeSucursal(empresaId: string, sucursalId: string): Promise<boolean> {
    return (await this.tx.sucursal.count({ where: { id: sucursalId, empresaId } })) > 0;
  }

  async metodoDeEmpresa(empresaId: string): Promise<MetodoValuacion> {
    const e = await this.tx.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: { metodoValuacion: true },
    });
    return e.metodoValuacion;
  }

  async bloquearProducto(productoId: string): Promise<void> {
    await this.tx.$queryRaw`SELECT id FROM productos WHERE id = ${productoId}::uuid FOR UPDATE`;
  }

  async movimientos(productoId: string, sucursalId: string, hasta?: string): Promise<MovimientoParaKardex[]> {
    const filas = await this.tx.movimientoInventario.findMany({
      where: {
        productoId,
        sucursalId,
        ...(hasta ? { fecha: { lte: new Date(`${hasta}T00:00:00.000Z`) } } : {}),
      },
      orderBy: [{ fecha: "asc" }, { secuencia: "asc" }],
    });
    return filas.map((m) => ({
      id: m.id,
      fecha: m.fecha.toISOString().slice(0, 10),
      tipo: m.tipo,
      cantidad: m.cantidad.toFixed(4),
      costoTotal: m.costoTotal.toFixed(2),
      referencia: m.referencia,
    }));
  }

  async series(
    empresaId: string,
    productoId: string,
    sucursalId: string,
    estado: ConsultaSeries["estado"],
  ): Promise<SerieInventarioVista[]> {
    const filas = await this.tx.serieInventario.findMany({
      where: {
        empresaId,
        productoId,
        sucursalId,
        ...(estado === "en_existencia" ? { movimientoSalidaId: null } : {}),
        ...(estado === "vendidas" ? { movimientoSalidaId: { not: null } } : {}),
      },
      include: {
        movimientoEntrada: { select: { fecha: true } },
        movimientoSalida: { select: { fecha: true } },
      },
      orderBy: { numeroSerie: "asc" },
    });
    return filas.map((serie) => ({
      id: serie.id,
      productoId: serie.productoId,
      sucursalId: serie.sucursalId,
      numeroSerie: serie.numeroSerie,
      costoUnitario: serie.costoUnitario.toFixed(2),
      estado: serie.movimientoSalidaId === null ? "en_existencia" : "vendida",
      fechaEntrada: serie.movimientoEntrada.fecha.toISOString().slice(0, 10),
      fechaSalida: serie.movimientoSalida?.fecha.toISOString().slice(0, 10) ?? null,
    }));
  }

  async seriesDisponibles(
    empresaId: string,
    productoId: string,
    sucursalId: string,
    numeros: readonly string[],
  ): Promise<SerieParaSalida[]> {
    const filas = await this.tx.serieInventario.findMany({
      where: {
        empresaId,
        productoId,
        sucursalId,
        numeroSerie: { in: [...numeros] },
        movimientoSalidaId: null,
      },
      select: { numeroSerie: true, costoUnitario: true },
      orderBy: { numeroSerie: "asc" },
    });
    return filas.map((serie) => ({
      numeroSerie: serie.numeroSerie,
      costoUnitario: serie.costoUnitario.toFixed(2),
    }));
  }

  async productosPorReabastecer(
    empresaId: string,
    sucursalId: string,
  ): Promise<ProductoReabastecimientoVista[]> {
    const filas = await this.tx.$queryRaw<
      {
        producto_id: string;
        codigo: string;
        nombre: string;
        unidad_medida: string;
        existencia_actual: string;
        existencia_minima: string;
        cantidad_faltante: string;
      }[]
    >`
      SELECT p.id::text AS producto_id, p.codigo, p.nombre, p.unidad_medida,
             round(coalesce(sum(CASE m.tipo WHEN 'entrada' THEN m.cantidad ELSE -m.cantidad END), 0), 4)::text AS existencia_actual,
             p.existencia_minima::text AS existencia_minima,
             round(p.existencia_minima - coalesce(sum(CASE m.tipo WHEN 'entrada' THEN m.cantidad ELSE -m.cantidad END), 0), 4)::text AS cantidad_faltante
      FROM productos p
      LEFT JOIN movimientos_inventario m
        ON m.producto_id = p.id AND m.sucursal_id = ${sucursalId}::uuid
      WHERE p.empresa_id = ${empresaId}::uuid
        AND p.activo = true
        AND p.existencia_minima > 0
      GROUP BY p.id
      HAVING coalesce(sum(CASE m.tipo WHEN 'entrada' THEN m.cantidad ELSE -m.cantidad END), 0) <= p.existencia_minima
      ORDER BY p.codigo ASC
    `;
    return filas.map((fila) => ({
      productoId: fila.producto_id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      unidadMedida: fila.unidad_medida,
      sucursalId,
      existenciaActual: fila.existencia_actual,
      existenciaMinima: fila.existencia_minima,
      cantidadFaltante: fila.cantidad_faltante,
    }));
  }

  async datosInventarioAnalitico(consulta: {
    empresaId: string;
    desde: string;
    hasta: string;
    sucursales: readonly string[] | null;
  }): Promise<DatosInventarioAnalitico> {
    const todas = consulta.sucursales === null;
    const sucursales = [...(consulta.sucursales ?? [])];
    const [empresa] = await this.tx.$queryRaw<{ sistema_inventario: SistemaInventario }[]>`
      SELECT sistema_inventario::text AS sistema_inventario
      FROM empresas
      WHERE id = ${consulta.empresaId}::uuid`;
    if (!empresa) throw new Error("No existe la empresa para el inventario analítico.");

    const [totales] = await this.tx.$queryRaw<
      {
        inventario_inicial: string;
        compras: string;
        gastos_sobre_compras: string;
        devoluciones_y_rebajas: string;
      }[]
    >`
      SELECT
        coalesce(sum(d.debe - d.haber) FILTER (
          WHERE left(c.codigo, 4) = '1109' AND p.fecha < ${consulta.desde}::date
        ), 0)::text AS inventario_inicial,
        coalesce(sum(d.debe - d.haber) FILTER (
          WHERE left(c.codigo, 4) = '4101' AND p.fecha BETWEEN ${consulta.desde}::date AND ${consulta.hasta}::date
        ), 0)::text AS compras,
        coalesce(sum(d.debe - d.haber) FILTER (
          WHERE left(c.codigo, 4) = '4102' AND p.fecha BETWEEN ${consulta.desde}::date AND ${consulta.hasta}::date
        ), 0)::text AS gastos_sobre_compras,
        coalesce(sum(d.haber - d.debe) FILTER (
          WHERE left(c.codigo, 4) = '5102' AND p.fecha BETWEEN ${consulta.desde}::date AND ${consulta.hasta}::date
        ), 0)::text AS devoluciones_y_rebajas
      FROM partida_detalles d
      JOIN partidas p ON p.id = d.partida_id AND p.empresa_id = d.empresa_id
      JOIN cuentas c ON c.id = d.cuenta_id AND c.empresa_id = d.empresa_id
      WHERE p.empresa_id = ${consulta.empresaId}::uuid
        AND p.estado IN ('contabilizada', 'anulada')
        AND p.fecha <= ${consulta.hasta}::date
        AND (${todas} OR p.sucursal_id = ANY(${sucursales}::uuid[]))`;

    const finales = await this.tx.$queryRaw<
      {
        sucursal_id: string;
        sucursal: string;
        fecha_toma: string | null;
        valor: string | null;
      }[]
    >`
      SELECT s.id::text AS sucursal_id, s.nombre AS sucursal,
             to_char(t.fecha, 'YYYY-MM-DD') AS fecha_toma,
             CASE WHEN t.id IS NULL THEN NULL ELSE (
               SELECT sum(d.valor_final)::text
               FROM tomas_fisicas_detalles d
               WHERE d.empresa_id = ${consulta.empresaId}::uuid
                 AND d.toma_fisica_id = t.id
             ) END AS valor
      FROM sucursales s
      LEFT JOIN LATERAL (
        SELECT tf.id, tf.fecha, tf.aprobado_en
        FROM tomas_fisicas tf
        WHERE tf.empresa_id = ${consulta.empresaId}::uuid
          AND tf.sucursal_id = s.id
          AND tf.estado = 'aprobada'
          AND tf.fecha <= ${consulta.hasta}::date
        ORDER BY tf.fecha DESC, tf.aprobado_en DESC, tf.id DESC
        LIMIT 1
      ) t ON true
      WHERE s.empresa_id = ${consulta.empresaId}::uuid
        AND (${todas} OR s.id = ANY(${sucursales}::uuid[]))
      ORDER BY s.nombre, s.id`;

    return {
      sistemaInventario: empresa.sistema_inventario,
      inventarioInicial: totales?.inventario_inicial ?? "0.00",
      compras: totales?.compras ?? "0.00",
      gastosSobreCompras: totales?.gastos_sobre_compras ?? "0.00",
      devolucionesYRebajas: totales?.devoluciones_y_rebajas ?? "0.00",
      inventarioFinalPorSucursal: finales.map((fila) => ({
        sucursalId: fila.sucursal_id,
        sucursal: fila.sucursal,
        fechaToma: fila.fecha_toma,
        valor: fila.valor,
      })),
    };
  }

  async registrarMovimiento(d: DatosMovimiento): Promise<string> {
    try {
      const m = await this.tx.movimientoInventario.create({
        data: {
          empresaId: d.empresaId,
          sucursalId: d.sucursalId,
          productoId: d.productoId,
          fecha: new Date(`${d.fecha}T00:00:00.000Z`),
          tipo: d.tipo,
          cantidad: d.cantidad,
          costoUnitario: d.costoUnitario,
          costoTotal: d.costoTotal,
          referencia: d.referencia,
        },
      });

      if (d.series?.length && d.tipo === "entrada") {
        try {
          await this.tx.serieInventario.createMany({
            data: d.series.map((serie) => ({
              empresaId: d.empresaId,
              sucursalId: d.sucursalId,
              productoId: d.productoId,
              numeroSerie: serie.numeroSerie,
              costoUnitario: serie.costoUnitario,
              movimientoEntradaId: m.id,
            })),
          });
        } catch (e) {
          if (e && typeof e === "object" && (e as { code?: unknown }).code === "P2002") {
            throw new SerieDuplicadaError();
          }
          throw e;
        }
      } else if (d.series?.length && d.tipo === "salida") {
        const actualizadas = await this.tx.serieInventario.updateMany({
          where: {
            empresaId: d.empresaId,
            sucursalId: d.sucursalId,
            productoId: d.productoId,
            numeroSerie: { in: d.series.map((serie) => serie.numeroSerie) },
            movimientoSalidaId: null,
          },
          data: { movimientoSalidaId: m.id },
        });
        if (actualizadas.count !== d.series.length) {
          throw new ReglaProductoError("Una o más series ya no están en existencia en esta sucursal.");
        }
      }
      return m.id;
    } catch (e) {
      const regla = mensajeDeRegla(e);
      if (regla) throw new ReglaProductoError(regla);
      throw e;
    }
  }
}

@Injectable()
export class RepositorioInventarioPrisma implements RepositorioInventario {
  constructor(private readonly baseDatos: BaseDatos) {}

  async enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadInventario) => Promise<T>): Promise<T> {
    try {
      return await comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
    } catch (e) {
      const regla = mensajeDeRegla(e);
      if (regla) throw new ReglaProductoError(regla);
      throw e;
    }
  }
}
