import type { PagoACuentaVista, PagosACuentaEjercicioVista } from "@contable/shared";

export interface AccesoPagoACuenta {
  permisos: ReadonlySet<string>;
  todasSucursales: boolean;
}

export class EmpresaPagoACuentaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o el usuario no tiene acceso a ella.");
  }
}
export class SinPermisoPagoACuentaError extends Error {}
export class AlcancePagoACuentaIncompletoError extends Error {}
export class ConflictoPagoACuentaError extends Error {}
export class ReglaPagoACuentaError extends Error {}
export class PagoACuentaNoEncontradoError extends Error {
  constructor() {
    super("Todavía no se generó la partida del pago a cuenta de ese mes.");
  }
}

export interface UnidadPagoACuenta {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoPagoACuenta | null>;
  consultar(empresaId: string, anio: number, mes: number): Promise<PagoACuentaVista>;
  generarPartida(empresaId: string, anio: number, mes: number): Promise<PagoACuentaVista>;
  presentar(usuarioId: string, empresaId: string, anio: number, mes: number): Promise<PagoACuentaVista>;
  ejercicio(empresaId: string, anio: number): Promise<PagosACuentaEjercicioVista>;
}

export interface RepositorioPagoACuenta {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadPagoACuenta) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_PAGO_A_CUENTA = Symbol("REPOSITORIO_PAGO_A_CUENTA");
