import type { NombresDeMayor } from "./estados.js";
import type { UnidadBalanza } from "./repositorio-balanza.js";

/** Lo que los estados financieros leen de la base: lo mismo que la balanza más los nombres de las cuentas de mayor. */
export interface UnidadEstados extends UnidadBalanza {
  /** Nombre de cada cuenta de mayor de la empresa con alguno de esos códigos. */
  nombresDeMayor(empresaId: string, codigos: readonly string[]): Promise<NombresDeMayor>;
}

export interface RepositorioEstados {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadEstados) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_ESTADOS = Symbol("RepositorioEstados");
