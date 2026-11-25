import type { CrearTercero, EditarTercero, RolTercero, TerceroVista } from "@contable/shared";

export class TerceroNoEncontradoError extends Error {
  constructor() {
    super("El cliente o proveedor no existe en esta empresa.");
  }
}

/** El NIT o el NRC ya lo usa otro cliente o proveedor de la empresa. */
export class TerceroDuplicadoError extends Error {
  constructor(campo: "nit" | "nrc", valor: string) {
    super(
      campo === "nit"
        ? `Ya existe un cliente o proveedor con el NIT ${valor} en esta empresa.`
        : `Ya existe un cliente o proveedor con el NRC ${valor} en esta empresa.`,
    );
  }
}

/** Regla del negocio rechazada por la API o por la base de datos. */
export class ReglaComercialError extends Error {}

export interface FiltroTerceros {
  rol?: RolTercero;
  /** Texto contenido en el nombre, el NIT o el NRC */
  busqueda?: string;
  /** Sin valor, todos; true solo activos; false solo inactivos */
  activo?: boolean;
}

/** Operaciones dentro de una transacción a nombre del usuario (la bitácora registra quién hizo cada cambio). */
export interface UnidadComercial {
  terceros(empresaId: string, filtro: FiltroTerceros): Promise<TerceroVista[]>;
  tercero(empresaId: string, terceroId: string): Promise<TerceroVista>;
  crearTercero(empresaId: string, datos: CrearTercero): Promise<TerceroVista>;
  editarTercero(empresaId: string, terceroId: string, cambios: EditarTercero): Promise<TerceroVista>;
}

export interface RepositorioComercial {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadComercial) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_COMERCIAL = Symbol("REPOSITORIO_COMERCIAL");
