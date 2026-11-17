import type { EstadoPartida, TipoPartida } from "@contable/shared";

export const PERMISO_ANULAR_PARTIDAS = "partidas.anular";
export const MAXIMO_MOTIVO_ANULACION = 500;

/** Línea de una partida, con los montos como texto decimal para no perder centavos. */
export interface LineaReversible {
  cuentaId: string;
  debe: string;
  haber: string;
  concepto: string | null;
}

/** Partida bloqueada para anularla, con lo necesario para armar su reversión. */
export interface PartidaAnulable {
  id: string;
  sucursalId: string;
  /** AAAA-MM-DD */
  fecha: string;
  estado: EstadoPartida;
  tipo: TipoPartida;
  numero: number | null;
  ambito: string | null;
  documentoTipo: string | null;
  documentoNumero: string | null;
  lineas: LineaReversible[];
}

/** Datos de la partida de reversión que se registra en lugar de borrar la original. */
export interface DatosReversion {
  partidaRevertidaId: string;
  sucursalId: string;
  fecha: string;
  concepto: string;
  documentoTipo: string | null;
  documentoNumero: string | null;
  lineas: LineaReversible[];
}

export interface NumeroAsignado {
  numero: number;
  ambito: string;
}

export interface ResultadoAnulacion {
  /** La partida anulada */
  original: { id: string } & NumeroAsignado;
  /** La partida de reversión, ya contabilizada */
  reversion: { id: string; fecha: string } & NumeroAsignado;
}

/** No se puede anular la partida (no está contabilizada, ya está anulada o es una reversión). */
export class PartidaNoAnulableError extends Error {}

/** El motivo es obligatorio: queda en la partida anulada y en la bitácora. */
export class MotivoAnulacionRequeridoError extends Error {
  constructor() {
    super("Indique el motivo de la anulación.");
  }
}

/** La reversión no puede quedar con fecha anterior a la de la partida que revierte. */
export class FechaReversionInvalidaError extends Error {
  constructor(fechaOriginal: string) {
    super(`La fecha de la reversión no puede ser anterior a la de la partida (${fechaOriginal}).`);
  }
}

/** La reversión invierte cada línea: lo que estaba al debe pasa al haber y al revés, con las mismas cuentas. */
export function lineasDeReversion(lineas: readonly LineaReversible[]): LineaReversible[] {
  return lineas.map((l) => ({ cuentaId: l.cuentaId, debe: l.haber, haber: l.debe, concepto: l.concepto }));
}

/** Concepto de la reversión: dice qué partida revierte y por qué. */
export function conceptoDeReversion(
  partida: Pick<PartidaAnulable, "numero" | "ambito">,
  motivo: string,
): string {
  const referencia =
    partida.numero === null ? "" : ` N.º ${partida.numero}${partida.ambito ? ` (${partida.ambito})` : ""}`;
  return `Reversión de la partida${referencia}: ${motivo}`;
}

/** Revisa que la partida pueda anularse; lanza PartidaNoAnulableError con el motivo si no. */
export function exigirAnulable(partida: Pick<PartidaAnulable, "estado" | "tipo">): void {
  if (partida.estado === "borrador") {
    throw new PartidaNoAnulableError("Un borrador no se anula: se edita o se elimina.");
  }
  if (partida.estado === "anulada") {
    throw new PartidaNoAnulableError("La partida ya está anulada.");
  }
  if (partida.tipo === "reversion") {
    throw new PartidaNoAnulableError(
      "Una partida de reversión no se anula; registre una partida nueva si hace falta.",
    );
  }
}
