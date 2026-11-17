import type { ConsultaPartidasDiario, PartidaDiario } from "./libro-diario.js";
import type { UnidadBalanza } from "./repositorio-balanza.js";

/** Lo que el libro diario lee de la base: el acceso y el ejercicio (como la balanza) y las partidas. */
export interface UnidadDiario extends UnidadBalanza {
  /**
   * Partidas contabilizadas y anuladas del período con sus líneas, en el orden en que se registraron
   * (fecha y momento de contabilización).
   */
  partidasDelDiario(consulta: ConsultaPartidasDiario): Promise<PartidaDiario[]>;
}

export interface RepositorioDiario {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadDiario) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_DIARIO = Symbol("RepositorioDiario");
