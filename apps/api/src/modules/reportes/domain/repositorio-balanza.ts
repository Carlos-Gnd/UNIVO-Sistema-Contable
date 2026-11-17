import type { AccesoReportes, ConsultaSaldos, FilaSaldos, RangoEjercicio } from "./balanza.js";

/** Consultas de solo lectura de la balanza, dentro de una misma transacción para un resultado consistente. */
export interface UnidadBalanza {
  /** Membresía activa del usuario en la empresa, o null si no pertenece a ella. */
  acceso(usuarioId: string, empresaId: string): Promise<AccesoReportes | null>;
  /** Si la sucursal existe en la empresa. */
  existeSucursal(empresaId: string, sucursalId: string): Promise<boolean>;
  /** Ejercicio que contiene la fecha, o null si no hay ninguno. */
  ejercicioDe(empresaId: string, fecha: string): Promise<RangoEjercicio | null>;
  /** Saldos por cuenta de último nivel de las partidas contabilizadas y anuladas que entran en la balanza. */
  saldos(consulta: ConsultaSaldos): Promise<FilaSaldos[]>;
}

export interface RepositorioBalanza {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadBalanza) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_BALANZA = Symbol("RepositorioBalanza");
