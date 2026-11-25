import type {
  CambiarEstadoCheque,
  CrearMovimientoBancario,
  FiltroMovimientosBancarios,
  MovimientoBancarioVista,
} from "@contable/shared";

export class MovimientoBancarioEmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe.");
  }
}

export class MovimientoBancarioNoEncontradoError extends Error {
  constructor() {
    super("El movimiento bancario no existe en esta empresa.");
  }
}

export class CuentaBancariaMovimientoNoEncontradaError extends Error {
  constructor() {
    super("La cuenta bancaria no existe en esta empresa.");
  }
}

export class SucursalMovimientoBancarioNoEncontradaError extends Error {
  constructor() {
    super("La sucursal no existe en esta empresa.");
  }
}

export class SucursalMovimientoBancarioNoAutorizadaError extends Error {
  constructor() {
    super("No tienes acceso a esa sucursal.");
  }
}

export class MovimientoBancarioDuplicadoError extends Error {
  constructor() {
    super("Ya existe esa referencia en la cuenta bancaria.");
  }
}

export class ReglaMovimientoBancarioError extends Error {}

export interface AccesoMovimientoBancario {
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export interface CuentaBancariaMovimiento {
  id: string;
  sucursalId: string | null;
  tipo: "caja" | "banco";
  activa: boolean;
}

export interface UnidadMovimientoBancario {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoMovimientoBancario | null>;
  cuenta(empresaId: string, id: string): Promise<CuentaBancariaMovimiento>;
  existeSucursal(empresaId: string, sucursalId: string): Promise<boolean>;
  listar(
    empresaId: string,
    filtro: FiltroMovimientosBancarios,
    acceso: AccesoMovimientoBancario,
  ): Promise<MovimientoBancarioVista[]>;
  crear(
    usuarioId: string,
    empresaId: string,
    datos: CrearMovimientoBancario,
    acceso: AccesoMovimientoBancario,
  ): Promise<MovimientoBancarioVista>;
  cambiarEstado(
    usuarioId: string,
    empresaId: string,
    id: string,
    datos: CambiarEstadoCheque,
  ): Promise<MovimientoBancarioVista>;
  sucursalDeMovimiento(empresaId: string, id: string): Promise<string>;
}

export interface RepositorioMovimientoBancario {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadMovimientoBancario) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_MOVIMIENTO_BANCARIO = Symbol("REPOSITORIO_MOVIMIENTO_BANCARIO");
