import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type {
  MetodoValuacion,
  MovimientoParaKardex,
  CategoriaProducto,
  CrearCategoria,
  CrearProducto,
  EditarCategoria,
  EditarProducto,
  ProductoVista,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  CategoriaDuplicadaError,
  CategoriaNoEncontradaError,
  CodigoProductoDuplicadoError,
  ProductoNoEncontradoError,
  ReglaProductoError,
  type AccesoInventario,
  type DatosMovimiento,
  type FiltroProductos,
  type RepositorioInventario,
  type UnidadInventario,
} from "../domain/producto.js";

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

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadInventario) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
