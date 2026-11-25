import {
  type ClaseGravamen,
  type ClasificacionContribuyente,
  type ConsultaNotas,
  type LineaPartida,
  type MotivoNota,
  type NotaComercialResumen,
  type NotaComercialVista,
  type OperacionComercial,
  type TipoDocumentoComercial,
  type TipoNota,
  type TotalesDocumento,
} from "@contable/shared";

/** El número de la nota ya está registrado para ese proveedor o en las notas de la empresa. */
export class NotaDuplicadaError extends Error {
  constructor(tipo: TipoNota, numero: string) {
    super(`Ya está registrada la nota de ${tipo === "credito" ? "crédito" : "débito"} ${numero}.`);
  }
}

export class NotaNoEncontradaError extends Error {
  constructor() {
    super("La nota no existe en esta empresa.");
  }
}

/** Línea del documento original con lo que el kardex tomó o dio por ella. */
export interface LineaDocumentoParaNota {
  id: string;
  orden: number;
  productoId: string | null;
  productoCodigo: string | null;
  controlaSeries: boolean;
  cuentaId: string | null;
  descripcion: string;
  clase: ClaseGravamen;
  cantidad: string;
  precioUnitario: string;
  monto: string;
  /** Costo del movimiento del kardex de la línea (costo de ventas de una venta) */
  costoKardex: string | null;
}

export interface DocumentoParaNota {
  id: string;
  sucursalId: string;
  operacion: OperacionComercial;
  tipoDocumento: TipoDocumentoComercial;
  numeroDocumento: string;
  fecha: string;
  tercero: { id: string; nombre: string; clasificacion: ClasificacionContribuyente } | null;
  condicionPago: "contado" | "credito";
  ivaPercibido: string;
  ivaRetenido: string;
  estadoPartida: "borrador" | "contabilizada" | "anulada";
  lineas: LineaDocumentoParaNota[];
}

/** Lo ya devuelto o rebajado por línea del documento (notas de crédito no anuladas). */
export type AcumuladoNotas = Map<string, { cantidad: string; monto: string }>;

export interface LineaNotaGuardar {
  orden: number;
  lineaDocumentoId: string | null;
  productoId: string | null;
  cuentaId: string | null;
  descripcion: string;
  clase: ClaseGravamen;
  cantidad: string;
  precioUnitario: string;
  monto: string;
  movimientoInventarioId: string | null;
}

export interface DatosNotaGuardar {
  id: string;
  empresaId: string;
  sucursalId: string;
  documentoId: string;
  operacion: OperacionComercial;
  tipo: TipoNota;
  motivo: MotivoNota;
  numeroNota: string;
  fecha: string;
  terceroId: string | null;
  cuentaPagoId: string | null;
  totales: TotalesDocumento;
  partidaId: string;
  partidaCostoId: string | null;
  observaciones: string | null;
  usuarioId: string;
  lineas: readonly LineaNotaGuardar[];
}

export interface FiltroNotas extends ConsultaNotas {
  /** Sucursales que puede ver el usuario; null si ve todas */
  sucursales: readonly string[] | null;
}

export type { NotaComercialResumen, NotaComercialVista };

/**
 * Una nota de crédito revierte la partida del documento: lo que este cargaba, la nota lo abona, y al revés.
 * El orden de las líneas se conserva.
 */
export function invertirPartida<T extends LineaPartida>(lineas: readonly T[]): T[] {
  return lineas.map((l) => ({ ...l, debe: l.haber, haber: l.debe }));
}

export const NOMBRE_NOTA: Record<TipoNota, string> = { credito: "nota de crédito", debito: "nota de débito" };
export const NOMBRE_MOTIVO: Record<MotivoNota, string> = {
  devolucion: "devolución",
  rebaja: "rebaja",
  cargo: "cargo adicional",
};
