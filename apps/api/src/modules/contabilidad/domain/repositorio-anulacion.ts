import type { AccesoPartidas } from "./partida-borrador.js";
import type { DatosReversion, NumeroAsignado, PartidaAnulable } from "./anulacion.js";

/** Operaciones disponibles dentro de la transacción de anulación. */
export interface UnidadAnulacion {
  /** Membresía activa del usuario en la empresa, o null si no pertenece a ella. */
  acceso(usuarioId: string, empresaId: string): Promise<AccesoPartidas | null>;
  /** Bloquea la partida (FOR UPDATE) hasta el fin de la transacción, o null si no es de la empresa. */
  bloquear(empresaId: string, partidaId: string): Promise<PartidaAnulable | null>;
  /** Registra la reversión como borrador, con su referencia a la original. Lanza ReglaContableError si la base lo rechaza. */
  crearReversion(empresaId: string, datos: DatosReversion): Promise<string>;
  /** Contabiliza la reversión: la base le asigna el correlativo. Lanza ReglaContableError si la base lo rechaza. */
  contabilizar(partidaId: string): Promise<NumeroAsignado>;
  /** Marca la original como anulada, con el motivo. Lanza ReglaContableError si la base lo rechaza. */
  anular(partidaId: string, motivo: string): Promise<void>;
}

/** Puerto de persistencia: todo en una transacción a nombre del usuario (para la bitácora). */
export interface RepositorioAnulacion {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadAnulacion) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_ANULACION = Symbol("RepositorioAnulacion");
