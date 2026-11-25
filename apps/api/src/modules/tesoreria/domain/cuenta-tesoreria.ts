import type { CrearCuentaTesoreria, CuentaTesoreriaVista, EditarCuentaTesoreria } from "@contable/shared";

export class CuentaTesoreriaNoEncontradaError extends Error {
  constructor() {
    super("La caja o cuenta bancaria no existe en esta empresa.");
  }
}
export class CuentaContableNoEncontradaError extends Error {
  constructor() {
    super("La cuenta contable no existe en esta empresa.");
  }
}
export class SucursalNoEncontradaError extends Error {
  constructor() {
    super("La sucursal no existe en esta empresa.");
  }
}
export class SucursalNoAutorizadaError extends Error {
  constructor() {
    super("No tienes acceso a esa sucursal.");
  }
}
/** La cuenta contable ya está vinculada a otra caja o banco. */
export class CuentaContableEnUsoError extends Error {
  constructor() {
    super("Esa cuenta contable ya está vinculada a otra caja o cuenta bancaria.");
  }
}
export class CuentaBancariaDuplicadaError extends Error {
  constructor(banco: string, numero: string) {
    super(`Ya existe la cuenta ${numero} del banco ${banco} en esta empresa.`);
  }
}
/** Regla del negocio que rechaza la base (cuenta que no es de efectivo, con subcuentas…). */
export class ReglaTesoreriaError extends Error {}

export interface AccesoTesoreria {
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export interface UnidadTesoreria {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoTesoreria | null>;
  /** Cuentas con su saldo; si el usuario no ve todas las sucursales, solo las de las suyas. */
  cuentas(empresaId: string, acceso: AccesoTesoreria): Promise<CuentaTesoreriaVista[]>;
  cuenta(empresaId: string, id: string): Promise<CuentaTesoreriaVista>;
  crear(empresaId: string, datos: CrearCuentaTesoreria): Promise<CuentaTesoreriaVista>;
  editar(empresaId: string, id: string, cambios: EditarCuentaTesoreria): Promise<CuentaTesoreriaVista>;
  existeSucursal(empresaId: string, sucursalId: string): Promise<boolean>;
}

export interface RepositorioTesoreria {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadTesoreria) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_TESORERIA = Symbol("REPOSITORIO_TESORERIA");
