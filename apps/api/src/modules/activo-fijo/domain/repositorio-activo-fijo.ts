import type { ActivoFijoVista, PartidaGenerada } from "@contable/shared";
import type { CuentaCatalogo, DatosNuevoActivo, DatosPartida } from "./activo-fijo.js";

/** Permisos y sucursales del usuario en la empresa. */
export interface AccesoActivos {
  permisos: ReadonlySet<string>;
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export const puedeUsarSucursal = (acceso: AccesoActivos, sucursalId: string) =>
  acceso.todasSucursales || acceso.sucursales.includes(sucursalId);

/** Operaciones disponibles dentro de la transacción de los activos fijos. */
export interface UnidadActivoFijo {
  /** Membresía activa del usuario en la empresa, o null si no pertenece a ella. */
  acceso(usuarioId: string, empresaId: string): Promise<AccesoActivos | null>;
  /** Activos de la empresa; con `sucursales` solo los de esas sucursales. */
  listar(empresaId: string, sucursales: readonly string[] | null): Promise<ActivoFijoVista[]>;
  /** Un activo; con `bloquear` lo retiene (FOR UPDATE) hasta el fin de la transacción. */
  obtener(empresaId: string, activoId: string, bloquear?: boolean): Promise<ActivoFijoVista | null>;
  existeSucursal(empresaId: string, sucursalId: string): Promise<boolean>;
  cuentasPorCodigo(empresaId: string, codigos: readonly string[]): Promise<CuentaCatalogo[]>;
  cuentasPorId(empresaId: string, ids: readonly string[]): Promise<CuentaCatalogo[]>;
  /** Crea el activo (la base le asigna el código AF-NNNN) y devuelve su id. */
  insertar(empresaId: string, usuarioId: string, datos: DatosNuevoActivo): Promise<string>;
  /** Registra y contabiliza una partida de este módulo. Lanza ReglaContableError si la base la rechaza. */
  contabilizarPartida(empresaId: string, partida: DatosPartida): Promise<PartidaGenerada>;
  /** Activos en estado «activo» de las sucursales indicadas (null = todas), retenidos hasta el fin de la transacción. */
  activosDepreciables(empresaId: string, sucursales: readonly string[] | null): Promise<ActivoFijoVista[]>;
  /** Registra la cuota del mes de un activo y actualiza su depreciación acumulada. */
  registrarDepreciacion(
    empresaId: string,
    usuarioId: string,
    datos: { activoId: string; mes: string; cuota: string; acumulada: string; partidaId: string },
  ): Promise<void>;
  /** Partida de cada mes ya depreciado del activo, por primer día del mes. */
  partidasDeDepreciacion(empresaId: string, activoId: string): Promise<Map<string, string>>;
  vincularAlta(activoId: string, partidaId: string): Promise<void>;
  registrarBaja(activoId: string, fecha: string, partidaId: string): Promise<void>;
}

/** Puerto de persistencia: todo en una transacción a nombre del usuario (para la bitácora). */
export interface RepositorioActivoFijo {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadActivoFijo) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_ACTIVO_FIJO = Symbol("RepositorioActivoFijo");
