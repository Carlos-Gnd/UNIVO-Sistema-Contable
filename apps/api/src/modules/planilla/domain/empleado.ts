import type { CrearEmpleado, EditarEmpleado, EmpleadoVista } from "@contable/shared";

export class EmpleadoNoEncontradoError extends Error {
  constructor() {
    super("El empleado no existe en esta empresa.");
  }
}

export class EmpresaPlanillaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tienes acceso.");
  }
}

export class EmpleadoDuplicadoError extends Error {
  constructor() {
    super("Ya existe un empleado con ese DUI, NIT, número ISSS o NUP en esta empresa.");
  }
}

export class ReglaEmpleadoError extends Error {}

export class SucursalEmpleadoNoEncontradaError extends Error {
  constructor() {
    super("La sucursal no existe o está inactiva en esta empresa.");
  }
}

export class SucursalEmpleadoNoAutorizadaError extends Error {
  constructor() {
    super("No tienes acceso a esa sucursal.");
  }
}

export interface AccesoPlanilla {
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export interface FiltroEmpleados {
  activo?: boolean;
}

export interface UnidadEmpleados {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoPlanilla | null>;
  empleados(usuarioId: string, empresaId: string, filtro: FiltroEmpleados): Promise<EmpleadoVista[]>;
  empleado(usuarioId: string, empresaId: string, empleadoId: string): Promise<EmpleadoVista>;
  crearEmpleado(usuarioId: string, empresaId: string, datos: CrearEmpleado): Promise<EmpleadoVista>;
  editarEmpleado(
    usuarioId: string,
    empresaId: string,
    empleadoId: string,
    cambios: EditarEmpleado,
  ): Promise<EmpleadoVista>;
}

export interface RepositorioEmpleados {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadEmpleados) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_EMPLEADOS = Symbol("REPOSITORIO_EMPLEADOS");
