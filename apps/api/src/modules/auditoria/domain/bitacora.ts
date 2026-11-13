import type { EntradaBitacora, FiltrosBitacora } from "@contable/shared";

export const PERMISO_VER_BITACORA = "bitacora.ver";

/** Diferencia de El Salvador con UTC (no tiene horario de verano). */
export const ZONA_EL_SALVADOR = "-06:00";

/** La empresa no existe o el usuario no pertenece a ella (no se revela cuál de las dos). */
export class EmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}

export class SinPermisoBitacoraError extends Error {
  constructor() {
    super("Su rol no permite consultar la bitácora de esta empresa.");
  }
}

/** Sucursales que el usuario puede ver según su membresía (HU-08). */
export interface AlcanceSucursales {
  todas: boolean;
  asignadas: readonly string[];
}

/**
 * Qué cambios ve quien está limitado a sus sucursales (auxiliar y consulta). Quien tiene todas las
 * sucursales (administrador y contador) ve toda la bitácora de la empresa.
 * - partidas: si su sucursal (antes o después del cambio) es una de las asignadas.
 * - partida_detalles: si la partida de la línea es de una sucursal asignada.
 * - sucursales: si es una de las asignadas.
 * - Datos de toda la empresa: siempre.
 * - membresias y membresia_sucursales (usuarios y permisos): nunca. Tampoco una tabla que no esté en
 *   esta lista: lo nuevo queda oculto hasta decidir su regla.
 */
export const TABLAS_DE_TODA_LA_EMPRESA = ["empresas", "cuentas", "ejercicios", "periodos"] as const;

/** Filtros ya traducidos para la base: tablas del módulo e instantes en UTC. */
export interface CriteriosBitacora {
  empresaId: string;
  /** null si el usuario ve todas las sucursales */
  sucursalesAsignadas: readonly string[] | null;
  usuarioId?: string;
  tablas?: readonly string[];
  accion?: FiltrosBitacora["accion"];
  /** Desde este instante, incluido */
  desde?: Date;
  /** Hasta este instante, sin incluirlo */
  antesDe?: Date;
  saltar: number;
  tomar: number;
}

/** Puerto de lectura de la bitácora. */
export interface RepositorioBitacora {
  /** Permisos del usuario en la empresa, o null si no tiene una membresía activa en ella. */
  permisos(usuarioId: string, empresaId: string): Promise<ReadonlySet<string> | null>;
  /** Sucursales asignadas al usuario en la empresa, o todas. */
  accesoSucursales(usuarioId: string, empresaId: string): Promise<AlcanceSucursales>;
  /**
   * Página de cambios, del más reciente al más antiguo, y el total que cumple los criterios. El límite
   * por sucursal se aplica igual a la página y al total, para que la paginación cuadre.
   */
  buscar(criterios: CriteriosBitacora): Promise<{ registros: EntradaBitacora[]; total: number }>;
}

export const REPOSITORIO_BITACORA = Symbol("RepositorioBitacora");

/** Primer instante de un día calendario de El Salvador. */
export const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00${ZONA_EL_SALVADOR}`);

/** Primer instante del día siguiente: así «hasta» incluye el día completo. */
export function inicioDelDiaSiguiente(fecha: string): Date {
  const d = inicioDelDia(fecha);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
