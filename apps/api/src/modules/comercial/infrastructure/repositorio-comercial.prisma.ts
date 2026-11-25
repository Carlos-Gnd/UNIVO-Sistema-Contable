import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import { Dinero } from "@contable/shared";
import type {
  AbonoResumen,
  AbonoVista,
  DocumentoPendiente,
  CrearTercero,
  CuentaInfo,
  DocumentoComercialResumen,
  DocumentoComercialVista,
  EditarTercero,
  NotaComercialResumen,
  NotaComercialVista,
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
import type { FiltroAntiguedad, SaldoDocumentoAl } from "../domain/antiguedad.js";
import {
  AbonoNoEncontradoError,
  type DatosAbonoGuardar,
  type DocumentoParaAbono,
  type FiltroAbonos,
  type FiltroPendientes,
} from "../domain/abono.js";
import {
  NotaDuplicadaError,
  NotaNoEncontradaError,
  type AcumuladoNotas,
  type DatosNotaGuardar,
  type DocumentoParaNota,
  type FiltroNotas,
} from "../domain/nota.js";
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
    numeroDocumentoHasta: d.numeroDocumentoHasta,
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
    partidaCostoId: d.partidaCostoId,
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

/** Índices únicos de notas que viola un registro repetido (P2002). */
function notaRepetida(error: unknown): boolean {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return false;
  return /notas_comerciales_(compra|venta)_unica/.test(
    JSON.stringify((error as { meta?: unknown }).meta ?? {}),
  );
}

const incluirNota = { lineas: { orderBy: { orden: "asc" as const } } } as const;

type Decimal2 = { toFixed(n: number): string };

interface FilaNota {
  id: string;
  operacion: "compra" | "venta";
  tipo: "credito" | "debito";
  motivo: "devolucion" | "rebaja" | "cargo";
  numeroNota: string;
  fecha: Date;
  documentoId: string;
  terceroId: string | null;
  cuentaPagoId: string | null;
  totalGravado: Decimal2;
  totalExento: Decimal2;
  totalNoSujeto: Decimal2;
  iva: Decimal2;
  ivaPercibido: Decimal2;
  ivaRetenido: Decimal2;
  total: Decimal2;
  totalNeto: Decimal2;
  partidaId: string;
  partidaCostoId: string | null;
  observaciones: string | null;
  lineas: {
    orden: number;
    productoId: string | null;
    cuentaId: string | null;
    descripcion: string;
    claseGravamen: "gravada" | "exenta" | "no_sujeta";
    cantidad: Decimal2;
    precioUnitario: Decimal2;
    monto: Decimal2;
    movimientoInventarioId: string | null;
  }[];
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
          partidaCostoId: d.partidaCostoId,
          numeroDocumentoHasta: d.numeroDocumentoHasta,
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

  async documentoParaNota(empresaId: string, documentoId: string): Promise<DocumentoParaNota> {
    const d = await this.tx.documentoComercial.findFirst({
      where: { id: documentoId, empresaId },
      include: {
        tercero: { select: { id: true, nombre: true, clasificacion: true } },
        partida: { select: { estado: true } },
        lineas: {
          orderBy: { orden: "asc" },
          include: {
            producto: { select: { codigo: true, controlaSeries: true } },
            movimiento: { select: { costoTotal: true } },
          },
        },
      },
    });
    if (!d) throw new DocumentoNoEncontradoError();
    return {
      id: d.id,
      sucursalId: d.sucursalId,
      operacion: d.operacion,
      tipoDocumento: d.tipoDocumento,
      numeroDocumento: d.numeroDocumento,
      fecha: fechaTexto(d.fecha),
      tercero: d.tercero,
      condicionPago: d.condicionPago,
      ivaPercibido: dos(d.ivaPercibido),
      ivaRetenido: dos(d.ivaRetenido),
      estadoPartida: d.partida.estado,
      lineas: d.lineas.map((l) => ({
        id: l.id,
        orden: l.orden,
        productoId: l.productoId,
        productoCodigo: l.producto?.codigo ?? null,
        controlaSeries: l.producto?.controlaSeries ?? false,
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

  async acumuladoNotas(documentoId: string): Promise<AcumuladoNotas> {
    const filas = await this.tx.$queryRaw<{ linea_id: string; cantidad: string; monto: string }[]>`
      SELECT l.linea_documento_id::text AS linea_id, sum(l.cantidad)::text AS cantidad, sum(l.monto)::text AS monto
      FROM notas_comerciales_lineas l
      JOIN notas_comerciales n ON n.id = l.nota_id AND n.tipo = 'credito' AND n.documento_id = ${documentoId}::uuid
      JOIN partidas p ON p.id = n.partida_id AND p.estado <> 'anulada'
      GROUP BY l.linea_documento_id`;
    return new Map(filas.map((f) => [f.linea_id, { cantidad: f.cantidad, monto: f.monto }]));
  }

  async saldoDocumento(documentoId: string): Promise<string> {
    const [fila] = await this.tx.$queryRaw<{ saldo: string | null }[]>`
      SELECT interno.saldo_documento(${documentoId}::uuid, true)::text AS saldo`;
    return Dinero.de(fila?.saldo ?? "0").aTexto();
  }

  async notaRegistrada(
    empresaId: string,
    operacion: OperacionComercial,
    tipo: string,
    terceroId: string | null,
    numero: string,
  ): Promise<boolean> {
    const n = await this.tx.notaComercial.count({
      where: {
        empresaId,
        operacion,
        tipo: tipo as "credito" | "debito",
        numeroNota: numero,
        ...(operacion === "compra" ? { terceroId } : {}),
      },
    });
    return n > 0;
  }

  async crearNota(d: DatosNotaGuardar): Promise<void> {
    try {
      await this.tx.notaComercial.create({
        data: {
          id: d.id,
          empresaId: d.empresaId,
          sucursalId: d.sucursalId,
          documentoId: d.documentoId,
          operacion: d.operacion,
          tipo: d.tipo,
          motivo: d.motivo,
          numeroNota: d.numeroNota,
          fecha: new Date(`${d.fecha}T00:00:00.000Z`),
          terceroId: d.terceroId,
          cuentaPagoId: d.cuentaPagoId,
          totalGravado: d.totales.totalGravado,
          totalExento: d.totales.totalExento,
          totalNoSujeto: d.totales.totalNoSujeto,
          iva: d.totales.iva,
          ivaPercibido: d.totales.ivaPercibido,
          ivaRetenido: d.totales.ivaRetenido,
          total: d.totales.total,
          totalNeto: d.totales.totalNeto,
          partidaId: d.partidaId,
          partidaCostoId: d.partidaCostoId,
          observaciones: d.observaciones,
          creadoPor: d.usuarioId,
        },
      });
      await this.tx.lineaNotaComercial.createMany({
        data: d.lineas.map((l) => ({
          empresaId: d.empresaId,
          notaId: d.id,
          orden: l.orden,
          lineaDocumentoId: l.lineaDocumentoId,
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
      if (notaRepetida(e)) throw new NotaDuplicadaError(d.tipo, d.numeroNota);
      throw e;
    }
  }

  async notas(empresaId: string, f: FiltroNotas): Promise<NotaComercialResumen[]> {
    const texto = f.busqueda?.trim();
    const filas = await this.tx.notaComercial.findMany({
      where: {
        empresaId,
        operacion: f.operacion,
        ...(f.sucursales ? { sucursalId: { in: [...f.sucursales] } } : {}),
        ...(f.documentoId ? { documentoId: f.documentoId } : {}),
        ...(f.desde || f.hasta
          ? {
              fecha: {
                ...(f.desde ? { gte: new Date(`${f.desde}T00:00:00.000Z`) } : {}),
                ...(f.hasta ? { lte: new Date(`${f.hasta}T00:00:00.000Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      include: incluirNota,
    });
    const vistas = await this.vistasDeNotas(empresaId, filas as unknown as FilaNota[]);
    const buscado = texto?.toLowerCase();
    return vistas
      .filter(
        (v) =>
          !buscado ||
          v.numeroNota.toLowerCase().includes(buscado) ||
          (v.tercero?.nombre.toLowerCase().includes(buscado) ?? false),
      )
      .map((v) => {
        const resumen: Partial<NotaComercialVista> = v;
        delete resumen.lineas;
        return resumen as NotaComercialResumen;
      });
  }

  async nota(empresaId: string, notaId: string): Promise<NotaComercialVista> {
    const n = await this.tx.notaComercial.findFirst({
      where: { id: notaId, empresaId },
      include: incluirNota,
    });
    if (!n) throw new NotaNoEncontradaError();
    return (await this.vistasDeNotas(empresaId, [n as unknown as FilaNota]))[0]!;
  }

  /** Completa las notas con su documento, tercero, estado de la partida y el costo del kardex de cada línea. */
  private async vistasDeNotas(empresaId: string, filas: FilaNota[]): Promise<NotaComercialVista[]> {
    if (filas.length === 0) return [];
    const unicos = (ids: (string | null)[]) => [...new Set(ids.filter((i): i is string => i !== null))];
    const lineas = filas.flatMap((n) => n.lineas);
    const [documentos, terceros, partidas, productos, movimientos] = await Promise.all([
      this.tx.documentoComercial.findMany({
        where: { empresaId, id: { in: unicos(filas.map((n) => n.documentoId)) } },
        select: { id: true, tipoDocumento: true, numeroDocumento: true },
      }),
      this.tx.tercero.findMany({
        where: { empresaId, id: { in: unicos(filas.map((n) => n.terceroId)) } },
        select: { id: true, nombre: true, nit: true, nrc: true },
      }),
      this.tx.partida.findMany({
        where: { empresaId, id: { in: unicos(filas.map((n) => n.partidaId)) } },
        select: { id: true, estado: true },
      }),
      this.tx.producto.findMany({
        where: { empresaId, id: { in: unicos(lineas.map((l) => l.productoId)) } },
        select: { id: true, codigo: true },
      }),
      this.tx.movimientoInventario.findMany({
        where: { id: { in: unicos(lineas.map((l) => l.movimientoInventarioId)) } },
        select: { id: true, costoTotal: true },
      }),
    ]);
    const porId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const mDocumentos = porId(documentos);
    const mTerceros = porId(terceros);
    const mPartidas = porId(partidas);
    const mProductos = porId(productos);
    const mMovimientos = porId(movimientos);
    return filas.map((n) => ({
      id: n.id,
      operacion: n.operacion,
      tipo: n.tipo,
      motivo: n.motivo,
      numeroNota: n.numeroNota,
      fecha: fechaTexto(n.fecha),
      documento: mDocumentos.get(n.documentoId)!,
      tercero: n.terceroId ? (mTerceros.get(n.terceroId) ?? null) : null,
      cuentaPagoId: n.cuentaPagoId,
      totalGravado: dos(n.totalGravado),
      totalExento: dos(n.totalExento),
      totalNoSujeto: dos(n.totalNoSujeto),
      iva: dos(n.iva),
      ivaPercibido: dos(n.ivaPercibido),
      ivaRetenido: dos(n.ivaRetenido),
      total: dos(n.total),
      totalNeto: dos(n.totalNeto),
      partidaId: n.partidaId,
      estadoPartida: mPartidas.get(n.partidaId)!.estado,
      partidaCostoId: n.partidaCostoId,
      observaciones: n.observaciones,
      lineas: n.lineas.map((l) => ({
        orden: l.orden,
        productoId: l.productoId,
        productoCodigo: l.productoId ? (mProductos.get(l.productoId)?.codigo ?? null) : null,
        cuentaId: l.cuentaId,
        descripcion: l.descripcion,
        clase: l.claseGravamen,
        cantidad: l.cantidad.toFixed(4),
        precioUnitario: l.precioUnitario.toFixed(4),
        monto: dos(l.monto),
        costoKardex: l.movimientoInventarioId
          ? dos(mMovimientos.get(l.movimientoInventarioId)!.costoTotal)
          : null,
      })),
    }));
  }

  async documentosParaAbono(empresaId: string, ids: readonly string[]): Promise<DocumentoParaAbono[]> {
    const filas = await this.tx.$queryRaw<
      {
        id: string;
        operacion: "compra" | "venta";
        tipo_documento: "ccf" | "factura" | "exportacion";
        numero_documento: string;
        sucursal_id: string;
        fecha: string;
        tercero_id: string | null;
        condicion_pago: "contado" | "credito";
        estado: "borrador" | "contabilizada" | "anulada";
        saldo: string;
      }[]
    >`
      SELECT d.id::text, d.operacion::text, d.tipo_documento::text, d.numero_documento, d.sucursal_id::text, d.fecha::text,
             d.tercero_id::text, d.condicion_pago::text, p.estado::text,
             interno.saldo_documento(d.id, true)::text AS saldo
      FROM documentos_comerciales d JOIN partidas p ON p.id = d.partida_id
      WHERE d.empresa_id = ${empresaId}::uuid AND d.id = ANY(${[...ids]}::uuid[])`;
    return filas.map((f) => ({
      id: f.id,
      operacion: f.operacion,
      tipoDocumento: f.tipo_documento,
      numeroDocumento: f.numero_documento,
      sucursalId: f.sucursal_id,
      fecha: f.fecha,
      terceroId: f.tercero_id,
      condicionPago: f.condicion_pago,
      estadoPartida: f.estado,
      saldo: Dinero.de(f.saldo).aTexto(),
    }));
  }

  async crearAbono(d: DatosAbonoGuardar): Promise<void> {
    await this.tx.abono.create({
      data: {
        id: d.id,
        empresaId: d.empresaId,
        sucursalId: d.sucursalId,
        operacion: d.operacion,
        terceroId: d.terceroId,
        fecha: new Date(`${d.fecha}T00:00:00.000Z`),
        referencia: d.referencia,
        cuentaPagoId: d.cuentaPagoId,
        monto: d.monto,
        partidaId: d.partidaId,
        observaciones: d.observaciones,
        creadoPor: d.usuarioId,
      },
    });
    await this.tx.abonoDocumento.createMany({
      data: d.aplicaciones.map((a) => ({
        empresaId: d.empresaId,
        abonoId: d.id,
        documentoId: a.documentoId,
        monto: a.monto,
      })),
    });
  }

  async abonos(empresaId: string, f: FiltroAbonos): Promise<AbonoResumen[]> {
    const filas = await this.tx.abono.findMany({
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
      },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      include: { aplicaciones: true },
    });
    return (await this.vistasDeAbonos(empresaId, filas)).map((v) => {
      const resumen: Partial<AbonoVista> = v;
      delete resumen.aplicaciones;
      return resumen as AbonoResumen;
    });
  }

  async abono(empresaId: string, abonoId: string): Promise<AbonoVista> {
    const a = await this.tx.abono.findFirst({
      where: { id: abonoId, empresaId },
      include: { aplicaciones: true },
    });
    if (!a) throw new AbonoNoEncontradoError();
    return (await this.vistasDeAbonos(empresaId, [a]))[0]!;
  }

  private async vistasDeAbonos(
    empresaId: string,
    filas: {
      id: string;
      operacion: "compra" | "venta";
      sucursalId: string;
      terceroId: string;
      fecha: Date;
      referencia: string | null;
      cuentaPagoId: string;
      monto: Decimal2;
      partidaId: string;
      observaciones: string | null;
      aplicaciones: { documentoId: string; monto: Decimal2 }[];
    }[],
  ): Promise<AbonoVista[]> {
    if (filas.length === 0) return [];
    const [terceros, partidas, documentos] = await Promise.all([
      this.tx.tercero.findMany({
        where: { empresaId, id: { in: [...new Set(filas.map((a) => a.terceroId))] } },
        select: { id: true, nombre: true, nit: true },
      }),
      this.tx.partida.findMany({
        where: { empresaId, id: { in: filas.map((a) => a.partidaId) } },
        select: { id: true, estado: true },
      }),
      this.tx.documentoComercial.findMany({
        where: {
          empresaId,
          id: { in: [...new Set(filas.flatMap((a) => a.aplicaciones.map((x) => x.documentoId)))] },
        },
        select: { id: true, tipoDocumento: true, numeroDocumento: true },
      }),
    ]);
    return filas.map((a) => ({
      id: a.id,
      operacion: a.operacion,
      sucursalId: a.sucursalId,
      tercero: terceros.find((t) => t.id === a.terceroId)!,
      fecha: fechaTexto(a.fecha),
      referencia: a.referencia,
      cuentaPagoId: a.cuentaPagoId,
      monto: dos(a.monto),
      partidaId: a.partidaId,
      estadoPartida: partidas.find((p) => p.id === a.partidaId)!.estado,
      observaciones: a.observaciones,
      aplicaciones: a.aplicaciones.map((x) => {
        const d = documentos.find((y) => y.id === x.documentoId)!;
        return {
          documentoId: d.id,
          tipoDocumento: d.tipoDocumento,
          numeroDocumento: d.numeroDocumento,
          monto: dos(x.monto),
        };
      }),
    }));
  }

  async pendientes(empresaId: string, f: FiltroPendientes): Promise<DocumentoPendiente[]> {
    const texto = f.busqueda?.trim() ? `%${f.busqueda.trim().toLowerCase()}%` : null;
    const filas = await this.tx.$queryRaw<
      {
        id: string;
        tipo_documento: "ccf" | "factura" | "exportacion";
        numero_documento: string;
        fecha: string;
        fecha_vencimiento: string;
        sucursal_id: string;
        tercero_id: string;
        tercero_nombre: string;
        total_neto: string;
        ajustes: string;
        abonado: string;
        saldo: string;
        estado: "borrador" | "contabilizada";
      }[]
    >`
      SELECT * FROM (
        SELECT d.id::text, d.tipo_documento::text, d.numero_documento, d.fecha::text,
               d.fecha_vencimiento::text, d.sucursal_id::text, t.id::text AS tercero_id, t.nombre AS tercero_nombre,
               d.total_neto::text, p.estado::text AS estado,
               (coalesce((SELECT sum(CASE n.tipo WHEN 'credito' THEN n.total_neto ELSE -n.total_neto END)
                          FROM notas_comerciales n JOIN partidas pn ON pn.id = n.partida_id
                          WHERE n.documento_id = d.id AND pn.estado <> 'anulada'), 0))::text AS ajustes,
               (coalesce((SELECT sum(x.monto) FROM abonos_documentos x JOIN abonos a ON a.id = x.abono_id
                          JOIN partidas pa ON pa.id = a.partida_id
                          WHERE x.documento_id = d.id AND pa.estado <> 'anulada'), 0))::text AS abonado,
               interno.saldo_documento(d.id, true)::text AS saldo
        FROM documentos_comerciales d
        JOIN partidas p ON p.id = d.partida_id
        JOIN terceros t ON t.id = d.tercero_id AND t.empresa_id = d.empresa_id
        WHERE d.empresa_id = ${empresaId}::uuid AND d.operacion = ${f.operacion}::operacion_comercial
          AND d.condicion_pago = 'credito' AND p.estado <> 'anulada'
          AND (${f.terceroId ?? null}::uuid IS NULL OR d.tercero_id = ${f.terceroId ?? null}::uuid)
          AND (${f.sucursales ? [...f.sucursales] : null}::uuid[] IS NULL
               OR d.sucursal_id = ANY(${f.sucursales ? [...f.sucursales] : null}::uuid[]))
          AND (${texto}::text IS NULL OR lower(d.numero_documento) LIKE ${texto}::text OR lower(t.nombre) LIKE ${texto}::text)
      ) x
      WHERE x.saldo::numeric > 0
      ORDER BY x.fecha_vencimiento, x.fecha, x.numero_documento`;
    return filas.map((r) => ({
      id: r.id,
      operacion: f.operacion,
      tipoDocumento: r.tipo_documento,
      numeroDocumento: r.numero_documento,
      fecha: r.fecha,
      fechaVencimiento: r.fecha_vencimiento,
      sucursalId: r.sucursal_id,
      tercero: { id: r.tercero_id, nombre: r.tercero_nombre },
      condicionPago: "credito",
      totalNeto: Dinero.de(r.total_neto).aTexto(),
      ajustes: Dinero.de(r.ajustes).aTexto(),
      abonado: Dinero.de(r.abonado).aTexto(),
      saldo: Dinero.de(r.saldo).aTexto(),
      estadoPartida: r.estado,
    }));
  }

  async saldosAl(empresaId: string, f: FiltroAntiguedad): Promise<SaldoDocumentoAl[]> {
    const sucursales = f.sucursales ? [...f.sucursales] : null;
    const filas = await this.tx.$queryRaw<
      {
        id: string;
        tipo_documento: "ccf" | "factura" | "exportacion";
        numero_documento: string;
        fecha: string;
        fecha_vencimiento: string;
        sucursal_id: string;
        tercero_id: string;
        tercero_nombre: string;
        saldo: string;
      }[]
    >`
      SELECT * FROM (
        SELECT d.id::text, d.tipo_documento::text, d.numero_documento, d.fecha::text,
               d.fecha_vencimiento::text, d.sucursal_id::text, t.id::text AS tercero_id, t.nombre AS tercero_nombre,
               interno.saldo_documento_al(d.id, ${f.alFecha}::date)::text AS saldo
        FROM documentos_comerciales d
        JOIN partidas p ON p.id = d.partida_id AND p.estado = 'contabilizada'
        JOIN terceros t ON t.id = d.tercero_id AND t.empresa_id = d.empresa_id
        WHERE d.empresa_id = ${empresaId}::uuid AND d.operacion = ${f.operacion}::operacion_comercial
          AND d.condicion_pago = 'credito' AND d.fecha <= ${f.alFecha}::date
          AND (${f.terceroId ?? null}::uuid IS NULL OR d.tercero_id = ${f.terceroId ?? null}::uuid)
          AND (${sucursales}::uuid[] IS NULL OR d.sucursal_id = ANY(${sucursales}::uuid[]))
      ) x
      WHERE x.saldo::numeric > 0`;
    return filas.map((r) => ({
      documentoId: r.id,
      tipoDocumento: r.tipo_documento,
      numeroDocumento: r.numero_documento,
      fecha: r.fecha,
      fechaVencimiento: r.fecha_vencimiento,
      sucursalId: r.sucursal_id,
      tercero: { id: r.tercero_id, nombre: r.tercero_nombre },
      saldo: Dinero.de(r.saldo).aTexto(),
    }));
  }

  async saldoMayor(empresaId: string, f: FiltroAntiguedad): Promise<{ codigo: string; saldo: string }> {
    const cobrar = f.operacion === "venta";
    const codigo = cobrar ? "1103" : "2102";
    const sucursales = f.sucursales ? [...f.sucursales] : null;
    const [fila] = await this.tx.$queryRaw<{ saldo: string }[]>`
      SELECT coalesce(sum(CASE WHEN ${cobrar} THEN d.debe - d.haber ELSE d.haber - d.debe END), 0)::text AS saldo
      FROM partida_detalles d
      JOIN partidas p ON p.id = d.partida_id
      JOIN cuentas c ON c.id = d.cuenta_id
      WHERE c.empresa_id = ${empresaId}::uuid AND c.codigo LIKE ${codigo + "%"}
        AND p.estado IN ('contabilizada', 'anulada') AND p.fecha <= ${f.alFecha}::date
        AND (${sucursales}::uuid[] IS NULL OR p.sucursal_id = ANY(${sucursales}::uuid[]))`;
    return { codigo, saldo: Dinero.de(fila?.saldo ?? "0").aTexto() };
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
