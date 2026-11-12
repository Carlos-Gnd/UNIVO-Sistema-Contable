import type { AccesoEmpresa, PartidaPorContabilizar } from "./contabilizacion.js";

/** Operaciones disponibles dentro de la transacción de contabilización. */
export interface UnidadContabilizacion {
  /** Membresía activa del usuario en la empresa, o null si no pertenece a ella. */
  acceso(usuarioId: string, empresaId: string): Promise<AccesoEmpresa | null>;
  /**
   * Bloquea las partidas (FOR UPDATE) hasta el fin de la transacción y las devuelve en orden de fecha y
   * de registro. Omite las que no existen o son de otra empresa.
   */
  bloquearPartidas(empresaId: string, ids: string[]): Promise<PartidaPorContabilizar[]>;
  /**
   * Contabiliza un borrador: la base asigna el correlativo, bloqueando su ámbito hasta el fin de la
   * transacción. Si la base lo rechaza lanza ReglaContableError y deshace solo esa partida.
   */
  contabilizar(partidaId: string): Promise<{ numero: number; ambito: string }>;
}

/** Puerto de persistencia: ejecuta todo en una transacción a nombre del usuario (para la bitácora). */
export interface RepositorioContabilizacion {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadContabilizacion) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_CONTABILIZACION = Symbol("RepositorioContabilizacion");
