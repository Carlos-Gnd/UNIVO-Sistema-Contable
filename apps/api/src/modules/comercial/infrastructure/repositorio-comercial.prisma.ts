import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type {
  CrearTercero,
  CuentaInfo,
  DocumentoComercialResumen,
  DocumentoComercialVista,
  EditarTercero,
  OperacionComercial,
  TerceroVista,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import { UnidadInventarioPrisma } from "../../inventario/infrastructure/repositorio-inventario.prisma.js";
import type { UnidadInventario } from "../../inventario/domain/producto.js";
import {
  DocumentoDuplicadoError,
  DocumentoNoEncontradoError,
  type CuentaResuelta,
  type DatosDocumentoGuardar,
  type DatosPartidaBorrador,
  type DatosTerceroDocumento,
  type FiltroDocumentos,
  type ParametrosComerciales,
} from "../domain/documento.js";
import {
  ReglaComercialError,
  TerceroDuplicadoError,
  TerceroNoEncontradoError,
  type FiltroTerceros,
  type RepositorioComercial,
  type UnidadComercial,
} from "../domain/tercero.js";

/** Índice único que violó la operación (P2002), o null si es otro error; Postgres recorta el nombre del índice. */
export function campoDuplicado(error: unknown): "nit" | "nrc" | null {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return null;
  const detalle = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  if (detalle.includes("terceros_empresa_id_nit")) return "nit";
  if (detalle.includes("terceros_empresa_id_nrc")) return "nrc";
  return null;
}

interface TerceroFila {
  id: string;
  nombre: string;
  nit: string;
  nrc: string | null;
  actividadEconomica: string | null;
  clasificacion: TerceroVista["clasificacion"];
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  diasCredito: number;
  activo: boolean;
}

export const terceroAVista = (t: TerceroFila): TerceroVista => ({
  id: t.id,
  nombre: t.nombre,
  nit: t.nit,
  nrc: t.nrc,
  actividadEconomica: t.actividadEconomica,
  clasificacion: t.clasificacion,
  direccion: t.direccion,
  telefono: t.telefono,
  correo: t.correo,
  esCliente: t.esCliente,
  esProveedor: t.esProveedor,
  diasCredito: t.diasCredito,
  activo: t.activo,
});

export class UnidadTerceros {
  constructor(protected readonly tx: Tx) {}

  async terceros(empresaId: string, filtro: FiltroTerceros): Promise<TerceroVista[]> {
    const texto = filtro.busqueda?.trim();
    const filas = await this.tx.tercero.findMany({
      where: {
        empresaId,
        ...(filtro.rol === "cliente" ? { esCliente: true } : {}),
        ...(filtro.rol === "proveedor" ? { esProveedor: true } : {}),
        ...(filtro.activo !== undefined ? { activo: filtro.activo } : {}),
        ...(texto
          ? {
              OR: [
                { nombre: { contains: texto, mode: "insensitive" as const } },
                { nit: { contains: texto } },
                { nrc: { contains: texto } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
    });
    return filas.map(terceroAVista);
  }

  async tercero(empresaId: string, terceroId: string): Promise<TerceroVista> {
    const t = await this.tx.tercero.findFirst({ where: { id: terceroId, empresaId } });
    if (!t) throw new TerceroNoEncontradoError();
    return terceroAVista(t);
  }

  async crearTercero(empresaId: string, datos: CrearTercero): Promise<TerceroVista> {
    try {
      const t = await this.tx.tercero.create({
        data: {
          empresaId,
          nombre: datos.nombre,
          nit: datos.nit,
          nrc: datos.nrc ?? null,
          actividadEconomica: datos.actividadEconomica ?? null,
          clasificacion: datos.clasificacion,
          direccion: datos.direccion ?? null,
          telefono: datos.telefono ?? null,
          correo: datos.correo ?? null,
          esCliente: datos.esCliente,
          esProveedor: datos.esProveedor,
          diasCredito: datos.diasCredito,
        },
      });
      return terceroAVista(t);
    } catch (e) {
      const campo = campoDuplicado(e);
      if (campo) throw new TerceroDuplicadoError(campo, campo === "nit" ? datos.nit : (datos.nrc ?? ""));
      throw e;
    }
  }

  async editarTercero(empresaId: string, terceroId: string, c: EditarTercero): Promise<TerceroVista> {
    const actual = await this.tx.tercero.findFirst({ where: { id: terceroId, empresaId } });
    if (!actual) throw new TerceroNoEncontradoError();
    const esCliente = c.esCliente ?? actual.esCliente;
    const esProveedor = c.esProveedor ?? actual.esProveedor;
    if (!esCliente && !esProveedor) {
      throw new ReglaComercialError("Marca al menos una opción: cliente o proveedor.");
    }
    try {
      const t = await this.tx.tercero.update({
        where: { id: terceroId },
        data: {
          ...(c.nombre !== undefined ? { nombre: c.nombre } : {}),
          ...(c.nit !== undefined ? { nit: c.nit } : {}),
          ...(c.nrc !== undefined ? { nrc: c.nrc } : {}),
          ...(c.actividadEconomica !== undefined ? { actividadEconomica: c.actividadEconomica } : {}),
          ...(c.clasificacion !== undefined ? { clasificacion: c.clasificacion } : {}),
          ...(c.direccion !== undefined ? { direccion: c.direccion } : {}),
          ...(c.telefono !== undefined ? { telefono: c.telefono } : {}),
          ...(c.correo !== undefined ? { correo: c.correo } : {}),
          ...(c.esCliente !== undefined ? { esCliente: c.esCliente } : {}),
          ...(c.esProveedor !== undefined ? { esProveedor: c.esProveedor } : {}),
          ...(c.diasCredito !== undefined ? { diasCredito: c.diasCredito } : {}),
          ...(c.activo !== undefined ? { activo: c.activo } : {}),
        },
      });
      return terceroAVista(t);
    } catch (e) {
      const campo = campoDuplicado(e);
      if (campo) {
        throw new TerceroDuplicadoError(campo, campo === "nit" ? (c.nit ?? actual.nit) : (c.nrc ?? ""));
      }
      throw e;
    }
  }
}

const fechaTexto = (f: Date) => f.toISOString().slice(0, 10);

/** Índices únicos de documentos que viola un registro repetido (P2002). */
function documentoRepetido(error: unknown): boolean {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return false;
  return /documentos_comerciales_(compra|venta)_unica/.test(
    JSON.stringify((error as { meta?: unknown }).meta ?? {}),
  );
}

const incluirDocumento = {
  tercero: { select: { id: true, nombre: true, nit: true, nrc: true } },
  partida: { select: { estado: true } },
  lineas: {
    orderBy: { orden: "asc" as const },
    include: {
      producto: { select: { codigo: true } },
      movimiento: { select: { costoTotal: true } },
    },
  },
} as const;

type FilaDocumento = Awaited<ReturnType<Tx["documentoComercial"]["findFirstOrThrow"]>> & {
  tercero: { id: string; nombre: string; nit: string; nrc: string | null } | null;
  partida: { estado: "borrador" | "contabilizada" | "anulada" };
  lineas: {
    orden: number;
    productoId: string | null;
    cuentaId: string | null;
    descripcion: string;
    claseGravamen: "gravada" | "exenta" | "no_sujeta";
    cantidad: { toFixed(n: number): string };
    precioUnitario: { toFixed(n: number): string };
    monto: { toFixed(n: number): string };
    producto: { codigo: string } | null;
    movimiento: { costoTotal: { toFixed(n: number): string } } | null;
  }[];
};

const dos = (d: { toFixed(n: number): string }) => d.toFixed(2);

function documentoAVista(d: FilaDocumento): DocumentoComercialVista {
  return {
    id: d.id,
    operacion: d.operacion,
    tipoDocumento: d.tipoDocumento,
    numeroDocumento: d.numeroDocumento,
    fecha: fechaTexto(d.fecha),
    sucursalId: d.sucursalId,
    tercero: d.tercero,
    condicionPago: d.condicionPago,
    cuentaPagoId: d.cuentaPagoId,
    diasCredito: d.diasCredito,
    fechaVencimiento: d.fechaVencimiento ? fechaTexto(d.fechaVencimiento) : null,
    totalGravado: dos(d.totalGravado),
    totalExento: dos(d.totalExento),
    totalNoSujeto: dos(d.totalNoSujeto),
    iva: dos(d.iva),
    ivaPercibido: dos(d.ivaPercibido),
    ivaRetenido: dos(d.ivaRetenido),
    total: dos(d.total),
    totalNeto: dos(d.totalNeto),
    partidaId: d.partidaId,
    estadoPartida: d.partida.estado,
    partidaCostoId: null,
    observaciones: d.observaciones,
    lineas: d.lineas.map((l) => ({
      orden: l.orden,
      productoId: l.productoId,
      productoCodigo: l.producto?.codigo ?? null,
      cuentaId: l.cuentaId,
      descripcion: l.descripcion,
      clase: l.claseGravamen,
      cantidad: l.cantidad.toFixed(4),
      precioUnitario: l.precioUnitario.toFixed(4),
      monto: dos(l.monto),
      costoKardex: l.movimiento ? dos(l.movimiento.costoTotal) : null,
    })),
  };
}

class UnidadComercialPrisma extends UnidadTerceros implements UnidadComercial {
  readonly inventario: UnidadInventario;

  constructor(tx: Tx) {
    super(tx);
    this.inventario = new UnidadInventarioPrisma(tx);
  }

  async datosTerceroDocumento(empresaId: string, terceroId: string): Promise<DatosTerceroDocumento> {
    const t = await this.tx.tercero.findFirst({ where: { id: terceroId, empresaId } });
    if (!t) throw new TerceroNoEncontradoError();
    return {
      id: t.id,
      nombre: t.nombre,
      nrc: t.nrc,
      clasificacion: t.clasificacion,
      esCliente: t.esCliente,
      esProveedor: t.esProveedor,
      activo: t.activo,
      diasCredito: t.diasCredito,
    };
  }

  async parametros(empresaId: string): Promise<ParametrosComerciales> {
    const e = await this.tx.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: { clasificacion: true, sistemaInventario: true },
    });
    return { clasificacion: e.clasificacion, sistemaInventario: e.sistemaInventario };
  }

  async cuentaPorCodigo(empresaId: string, codigo: string): Promise<CuentaResuelta | null> {
    const [fila] = await this.tx.$queryRaw<CuentaResuelta[]>`
      SELECT c.id::text, c.codigo
      FROM cuentas c
      WHERE c.empresa_id = ${empresaId}::uuid AND c.activa
        AND c.codigo LIKE ${codigo + "%"}
        AND NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.cuenta_padre_id = c.id)
      ORDER BY (c.codigo = ${codigo}) DESC, c.codigo ASC
      LIMIT 1`;
    return fila ?? null;
  }

  cuentasInfo(empresaId: string, ids: readonly string[]): Promise<CuentaInfo[]> {
    return this.tx.$queryRaw<CuentaInfo[]>`
      SELECT c.id::text, c.codigo, c.activa,
             NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.cuenta_padre_id = c.id) AS imputable
      FROM cuentas c
      WHERE c.empresa_id = ${empresaId}::uuid AND c.id = ANY(${[...ids]}::uuid[])`;
  }

  async documentoRegistrado(
    empresaId: string,
    operacion: OperacionComercial,
    tipoDocumento: string,
    terceroId: string | null,
    numero: string,
  ): Promise<boolean> {
    const n = await this.tx.documentoComercial.count({
      where: {
        empresaId,
        operacion,
        tipoDocumento: tipoDocumento as "ccf" | "factura" | "exportacion",
        numeroDocumento: numero,
        ...(operacion === "compra" ? { terceroId } : {}),
      },
    });
    return n > 0;
  }

  async crearPartidaBorrador(d: DatosPartidaBorrador): Promise<string> {
    const [partida] = await this.tx.$queryRaw<{ id: string }[]>`
      INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, documento_tipo, documento_numero,
                            origen, origen_id, creado_por)
      VALUES (${d.empresaId}::uuid, ${d.sucursalId}::uuid, ${d.fecha}::date, 'operacion'::tipo_partida,
              ${d.concepto}, ${d.documentoTipo}, ${d.documentoNumero}, ${d.origen}, ${d.origenId}::uuid,
              ${d.usuarioId}::uuid)
      RETURNING id::text`;
    if (!partida) throw new Error("La base no devolvió el id de la partida");
    await this.tx.$executeRaw`
      INSERT INTO partida_detalles (partida_id, cuenta_id, debe, haber, concepto, orden)
      SELECT ${partida.id}::uuid, l.cuenta_id, l.debe, l.haber, l.concepto, (l.n - 1)::smallint
      FROM unnest(${d.lineas.map((l) => l.cuentaId)}::uuid[], ${d.lineas.map((l) => String(l.debe))}::numeric[],
                  ${d.lineas.map((l) => String(l.haber))}::numeric[], ${d.lineas.map((l) => l.concepto)}::text[])
           WITH ORDINALITY AS l(cuenta_id, debe, haber, concepto, n)`;
    return partida.id;
  }

  async crearDocumento(d: DatosDocumentoGuardar): Promise<void> {
    try {
      await this.tx.documentoComercial.create({
        data: {
          id: d.id,
          empresaId: d.empresaId,
          sucursalId: d.sucursalId,
          operacion: d.operacion,
          tipoDocumento: d.tipoDocumento,
          numeroDocumento: d.numeroDocumento,
          fecha: new Date(`${d.fecha}T00:00:00.000Z`),
          terceroId: d.terceroId,
          condicionPago: d.condicionPago,
          cuentaPagoId: d.cuentaPagoId,
          diasCredito: d.diasCredito,
          fechaVencimiento: d.fechaVencimiento ? new Date(`${d.fechaVencimiento}T00:00:00.000Z`) : null,
          totalGravado: d.totales.totalGravado,
          totalExento: d.totales.totalExento,
          totalNoSujeto: d.totales.totalNoSujeto,
          iva: d.totales.iva,
          ivaPercibido: d.totales.ivaPercibido,
          ivaRetenido: d.totales.ivaRetenido,
          total: d.totales.total,
          totalNeto: d.totales.totalNeto,
          partidaId: d.partidaId,
          observaciones: d.observaciones,
          creadoPor: d.usuarioId,
        },
      });
      await this.tx.lineaDocumentoComercial.createMany({
        data: d.lineas.map((l) => ({
          empresaId: d.empresaId,
          documentoId: d.id,
          orden: l.orden,
          productoId: l.productoId,
          cuentaId: l.cuentaId,
          descripcion: l.descripcion,
          claseGravamen: l.clase,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          monto: l.monto,
          movimientoInventarioId: l.movimientoInventarioId,
        })),
      });
    } catch (e) {
      if (documentoRepetido(e)) throw new DocumentoDuplicadoError(d.tipoDocumento, d.numeroDocumento);
      throw e;
    }
  }

  async documentos(empresaId: string, f: FiltroDocumentos): Promise<DocumentoComercialResumen[]> {
    const texto = f.busqueda?.trim();
    const filas = await this.tx.documentoComercial.findMany({
      where: {
        empresaId,
        operacion: f.operacion,
        ...(f.sucursales ? { sucursalId: { in: [...f.sucursales] } } : {}),
        ...(f.terceroId ? { terceroId: f.terceroId } : {}),
        ...(f.desde || f.hasta
          ? {
              fecha: {
                ...(f.desde ? { gte: new Date(`${f.desde}T00:00:00.000Z`) } : {}),
                ...(f.hasta ? { lte: new Date(`${f.hasta}T00:00:00.000Z`) } : {}),
              },
            }
          : {}),
        ...(texto
          ? {
              OR: [
                { numeroDocumento: { contains: texto, mode: "insensitive" as const } },
                { tercero: { nombre: { contains: texto, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      include: incluirDocumento,
    });
    return filas.map((fila) => {
      const vista: Partial<DocumentoComercialVista> = documentoAVista(fila as unknown as FilaDocumento);
      delete vista.lineas;
      return vista as DocumentoComercialResumen;
    });
  }

  async documento(
    empresaId: string,
    operacion: OperacionComercial,
    documentoId: string,
  ): Promise<DocumentoComercialVista> {
    const d = await this.tx.documentoComercial.findFirst({
      where: { id: documentoId, empresaId, operacion },
      include: incluirDocumento,
    });
    if (!d) throw new DocumentoNoEncontradoError();
    return documentoAVista(d as unknown as FilaDocumento);
  }
}

@Injectable()
export class RepositorioComercialPrisma implements RepositorioComercial {
  constructor(private readonly baseDatos: BaseDatos) {}

  async enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadComercial) => Promise<T>): Promise<T> {
    try {
      return await comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadComercialPrisma(tx)));
    } catch (e) {
      const regla = mensajeDeRegla(e);
      if (regla) throw new ReglaComercialError(regla);
      throw e;
    }
  }
}
