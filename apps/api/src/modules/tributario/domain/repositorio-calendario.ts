import type { Obligacion } from "@contable/shared";
import type { Presentacion } from "./calendario.js";

/** Permisos del usuario en la empresa. */
export interface AccesoCalendario {
  permisos: ReadonlySet<string>;
}

export interface UnidadCalendario {
  /** Membresía activa del usuario en la empresa, o null si no pertenece a ella. */
  acceso(usuarioId: string, empresaId: string): Promise<AccesoCalendario | null>;
  /** Presentaciones de los períodos entre `desde` y `hasta` (AAAA-MM), por «obligación:período». */
  presentaciones(empresaId: string, desde: string, hasta: string): Promise<Map<string, Presentacion>>;
  /** Marca como presentada (si ya lo estaba, actualiza la nota) y devuelve la constancia. */
  marcar(
    empresaId: string,
    usuarioId: string,
    obligacion: Obligacion,
    periodo: string,
    nota: string | null,
  ): Promise<Presentacion>;
  /** Quita la constancia; false si no existía. */
  desmarcar(empresaId: string, obligacion: Obligacion, periodo: string): Promise<boolean>;
}

export interface RepositorioCalendario {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadCalendario) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_CALENDARIO = Symbol("RepositorioCalendario");
