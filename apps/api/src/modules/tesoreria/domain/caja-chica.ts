import type {
  CajaChicaVista,
  CrearCajaChica,
  CrearValeCajaChica,
  ReintegrarCajaChica,
} from "@contable/shared";

export class CajaChicaEmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe.");
  }
}

export class CajaChicaNoEncontradaError extends Error {
  constructor() {
    super("La caja chica no existe en esta empresa.");
  }
}

export class SucursalCajaChicaNoEncontradaError extends Error {
  constructor() {
    super("La sucursal no existe en esta empresa.");
  }
}

export class SucursalCajaChicaNoAutorizadaError extends Error {
  constructor() {
    super("No tienes acceso a esa sucursal.");
  }
}

export class CajaChicaDuplicadaError extends Error {
  constructor() {
    super("Ya existe una caja chica para esta sucursal.");
  }
}

export class ReglaCajaChicaError extends Error {}

export class CuentaCajaChicaInvalidaError extends Error {
  constructor(mensaje = "La cuenta de caja chica no es válida.") {
    super(mensaje);
  }
}

export class CuentaGastoCajaChicaInvalidaError extends Error {
  constructor() {
    super("El gasto debe usar una cuenta activa e imputable de costos o gastos.");
  }
}

export class SinValesPorReintegrarError extends Error {
  constructor() {
    super("No hay vales por reintegrar.");
  }
}

export interface AccesoCajaChica {
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export interface UnidadCajaChica {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoCajaChica | null>;
  existeSucursal(empresaId: string, sucursalId: string): Promise<boolean>;
  cajas(empresaId: string, acceso: AccesoCajaChica): Promise<CajaChicaVista[]>;
  caja(empresaId: string, id: string): Promise<{ id: string; sucursalId: string }>;
  abrir(
    usuarioId: string,
    empresaId: string,
    datos: CrearCajaChica,
    acceso: AccesoCajaChica,
  ): Promise<CajaChicaVista>;
  registrarVale(empresaId: string, id: string, datos: CrearValeCajaChica): Promise<CajaChicaVista>;
  reintegrar(
    usuarioId: string,
    empresaId: string,
    id: string,
    datos: ReintegrarCajaChica,
    acceso: AccesoCajaChica,
  ): Promise<CajaChicaVista>;
}

export interface RepositorioCajaChica {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadCajaChica) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_CAJA_CHICA = Symbol("REPOSITORIO_CAJA_CHICA");
