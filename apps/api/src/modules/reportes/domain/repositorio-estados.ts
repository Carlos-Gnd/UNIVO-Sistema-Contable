import type { ClaveNota, FormatoEstados, VersionNota } from "@contable/shared";
import type { NombresDeMayor } from "./estados.js";
import type { DatosEmpresaNotas, NotaGuardada } from "./notas.js";
import type { UnidadBalanza } from "./repositorio-balanza.js";

export interface ParametrosEstados {
  tipoContribuyente: "persona_natural" | "sociedad";
  formatoEstados: FormatoEstados;
}

/** Lo que los estados financieros leen de la base: lo mismo que la balanza más los nombres de las cuentas de mayor. */
export interface UnidadEstados extends UnidadBalanza {
  /** Nombre de cada cuenta de mayor de la empresa con alguno de esos códigos. */
  nombresDeMayor(empresaId: string, codigos: readonly string[]): Promise<NombresDeMayor>;
  /**
   * Tipo de contribuyente de la empresa (del que dependen las columnas del estado de patrimonio) y formato
   * de estados que tiene configurado (el que se usa cuando la consulta no pide uno).
   */
  parametrosEstados(empresaId: string): Promise<ParametrosEstados>;
  /** Datos de la empresa que llenan las notas a los estados (HU-44). */
  datosEmpresaNotas(empresaId: string): Promise<DatosEmpresaNotas>;
  /** Texto vigente de cada nota guardada del ejercicio que contiene la fecha, por clave. */
  notasVigentes(empresaId: string, fecha: string): Promise<Map<string, NotaGuardada>>;
  /** Año del ejercicio que contiene la fecha; null si no hay ninguno. */
  anioDelEjercicio(empresaId: string, fecha: string): Promise<number | null>;
  /** Versiones guardadas de una nota del ejercicio de la fecha, de la más reciente a la más antigua. */
  versionesDeNota(empresaId: string, fecha: string, clave: ClaveNota): Promise<VersionNota[]>;
  /** Guarda una versión nueva de la nota del ejercicio de la fecha y devuelve su número. */
  guardarNota(empresaId: string, fecha: string, clave: ClaveNota, texto: string): Promise<number>;
}

export interface RepositorioEstados {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadEstados) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_ESTADOS = Symbol("RepositorioEstados");
