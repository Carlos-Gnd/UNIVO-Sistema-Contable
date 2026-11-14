import type { CrearPartida, CuentaInfo, ErrorLinea, EstadoPartida, PartidaVista } from "@contable/shared";

export const PERMISO_VER_PARTIDAS = "partidas.ver";
export const PERMISO_REGISTRAR_PARTIDAS = "partidas.registrar";

/** Permisos y sucursales del usuario en la empresa. */
export interface AccesoPartidas {
  permisos: ReadonlySet<string>;
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export const puedeUsarSucursal = (acceso: AccesoPartidas, sucursalId: string) =>
  acceso.todasSucursales || acceso.sucursales.includes(sucursalId);

/** La empresa no existe o el usuario no pertenece a ella (no se revela cuál de las dos). */
export class EmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}

export class SinPermisoPartidasError extends Error {}

/** La partida no existe, es de otra empresa o de una sucursal que el usuario no ve. */
export class PartidaNoEncontradaError extends Error {
  constructor() {
    super("La partida no existe en esta empresa.");
  }
}

export class SucursalNoAutorizadaError extends Error {
  constructor() {
    super("No tiene acceso a la sucursal indicada.");
  }
}

/** Solo los borradores se editan aquí; una contabilizada se edita con historial (HU-23). */
export class NoEsBorradorError extends Error {
  constructor(estado: EstadoPartida) {
    super(`La partida está ${estado}; solo se editan borradores.`);
  }
}

/** Errores de captura por línea (cuenta inexistente, inactiva, sin monto…): la partida no se guarda. */
export class LineasInvalidasError extends Error {
  constructor(readonly errores: ErrorLinea[]) {
    super("Corrija las líneas marcadas antes de guardar la partida.");
  }
}

/** Datos mínimos de una partida existente para decidir si se puede editar. */
export interface PartidaExistente {
  id: string;
  sucursalId: string;
  estado: EstadoPartida;
}

/** Operaciones disponibles dentro de la transacción que guarda un borrador. */
export interface UnidadPartidas {
  /** Membresía activa del usuario en la empresa, o null si no pertenece a ella. */
  acceso(usuarioId: string, empresaId: string): Promise<AccesoPartidas | null>;
  /** Cuentas de la empresa con esos ids (las de otra empresa no aparecen). */
  cuentas(empresaId: string, ids: readonly string[]): Promise<CuentaInfo[]>;
  /** Bloquea la partida (FOR UPDATE) hasta el fin de la transacción, o null si no es de la empresa. */
  bloquear(empresaId: string, partidaId: string): Promise<PartidaExistente | null>;
  /** Inserta el borrador con sus líneas y devuelve su id. Lanza ReglaContableError si la base lo rechaza. */
  crear(empresaId: string, datos: CrearPartida): Promise<string>;
  /** Reemplaza la cabecera y las líneas del borrador. Lanza ReglaContableError si la base lo rechaza. */
  reemplazar(partidaId: string, datos: CrearPartida): Promise<void>;
  leer(empresaId: string, partidaId: string): Promise<PartidaVista | null>;
}

/** Puerto de persistencia: todo en una transacción a nombre del usuario (para la bitácora). */
export interface RepositorioPartidas {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadPartidas) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_PARTIDAS = Symbol("RepositorioPartidas");
