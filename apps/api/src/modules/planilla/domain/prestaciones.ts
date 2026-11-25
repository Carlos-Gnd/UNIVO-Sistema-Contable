import type {
  CalcularPrestaciones,
  EmpleadoPrestacionesVista,
  ResultadoCalculoPrestacionesVista,
} from "@contable/shared";
import type { EstadoPartida } from "@contable/shared";
import type { CuentaParaPlanilla } from "./calculo-planilla.js";

export interface EmpleadoParaPrestaciones {
  empleadoId: string;
  dui: string;
  puesto: string;
  area: string | null;
  fechaIngreso: string;
  salario: string;
}

export interface PreparacionPrestaciones {
  fechaCalculo: string;
  periodo: string;
  sucursalId: string;
  sucursal: string;
  empleados: EmpleadoParaPrestaciones[];
  cuentas: Map<string, CuentaParaPlanilla>;
  cuentasGastoPorArea: Map<string, CuentaParaPlanilla>;
  partidaExistente: { id: string; estado: EstadoPartida } | null;
}

export const REPOSITORIO_PRESTACIONES = Symbol("REPOSITORIO_PRESTACIONES");

export interface RepositorioPrestaciones {
  preparar(
    usuarioId: string,
    empresaId: string,
    datos: CalcularPrestaciones,
  ): Promise<PreparacionPrestaciones>;
}

export class EmpresaPrestacionesNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}

export class SucursalPrestacionesNoAutorizadaError extends Error {
  constructor() {
    super("No tiene acceso a la sucursal indicada.");
  }
}

export class SinPermisoPrestacionesError extends Error {
  constructor() {
    super("Su rol no permite calcular prestaciones en esta empresa.");
  }
}

export class CuentaPrestacionesInvalidaError extends Error {
  constructor(readonly codigo?: string) {
    super(
      codigo
        ? `La cuenta ${codigo} debe estar activa y ser de último nivel.`
        : "Seleccione una cuenta de gasto activa e imputable del grupo de gastos.",
    );
  }
}

export class SinEmpleadosPrestacionesError extends Error {
  constructor() {
    super("No hay empleados activos para calcular prestaciones en esta sucursal y fecha.");
  }
}

export class PartidaPrestacionesNoEditableError extends Error {
  constructor(estado: EstadoPartida) {
    super(`La provisión de este período ya está ${estado}; no se puede recalcular.`);
  }
}

export class DatosPrestacionesInvalidosError extends Error {}

export type CalculoPrestaciones = ResultadoCalculoPrestacionesVista;
export type FilaPrestaciones = EmpleadoPrestacionesVista;
