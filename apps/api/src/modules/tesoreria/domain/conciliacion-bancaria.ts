import type {
  ActualizarDetalleConciliacion,
  ConciliacionBancariaVista,
  CrearConciliacionBancaria,
  ResultadoImportacionEstadoCuenta,
} from "@contable/shared";

export class ConciliacionNoEncontradaError extends Error {
  constructor() {
    super("La conciliación no existe en esta empresa.");
  }
}
export class ConciliacionCuentaNoEncontradaError extends Error {
  constructor() {
    super("La cuenta bancaria no existe en esta empresa.");
  }
}
export class ConciliacionDuplicadaError extends Error {
  constructor() {
    super("Ya existe una conciliación para esa cuenta y fecha de corte.");
  }
}
export class ConciliacionEmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe.");
  }
}
export class ConciliacionSucursalNoAutorizadaError extends Error {
  constructor() {
    super("No tienes acceso a esa sucursal.");
  }
}
export class ReglaConciliacionError extends Error {}
export interface LineaEstadoCuentaEntrada {
  numeroFila: number;
  fecha: string;
  referencia: string;
  descripcion: string;
  monto: string;
  huella: string;
}

export interface AccesoConciliacion {
  todasSucursales: boolean;
  sucursales: readonly string[];
}
export interface CuentaConciliacion {
  id: string;
  tipo: "caja" | "banco";
  sucursalId: string | null;
  activa: boolean;
}
export interface UnidadConciliacion {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoConciliacion | null>;
  cuenta(empresaId: string, id: string): Promise<CuentaConciliacion>;
  crear(
    usuarioId: string,
    empresaId: string,
    datos: CrearConciliacionBancaria,
  ): Promise<ConciliacionBancariaVista>;
  detalle(empresaId: string, id: string): Promise<ConciliacionBancariaVista>;
  marcar(
    empresaId: string,
    id: string,
    detalle: ActualizarDetalleConciliacion,
  ): Promise<ConciliacionBancariaVista>;
  estadoCuenta(
    empresaId: string,
    id: string,
    filas: LineaEstadoCuentaEntrada[],
    guardar: boolean,
  ): Promise<ResultadoImportacionEstadoCuenta[]>;
}
export interface RepositorioConciliacion {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadConciliacion) => Promise<T>): Promise<T>;
}
export const REPOSITORIO_CONCILIACION = Symbol("REPOSITORIO_CONCILIACION");
