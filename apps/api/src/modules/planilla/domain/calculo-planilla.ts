import type { CalcularPlanilla, ConfiguracionPlanillaVista, EstadoPartida } from "@contable/shared";

export interface EmpleadoParaPlanilla {
  empleadoId: string;
  sucursalId: string;
  nombres: string;
  apellidos: string;
  numeroIsss: string;
  nup: string;
  dui: string;
  nit: string;
  puesto: string;
  area: string | null;
  salario: string;
}

export interface CuentaParaPlanilla {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  imputable: boolean;
}

export interface PreparacionPlanilla {
  empleados: EmpleadoParaPlanilla[];
  configuracion: ConfiguracionPlanillaVista;
  cuentas: Map<string, CuentaParaPlanilla>;
  cuentasGastoPorArea: Map<string, CuentaParaPlanilla>;
  periodo: string;
  sucursalId: string;
  sucursal: string;
  partidaExistente: { id: string; estado: EstadoPartida } | null;
}

export const REPOSITORIO_CALCULO_PLANILLA = Symbol("REPOSITORIO_CALCULO_PLANILLA");

export interface RepositorioCalculoPlanilla {
  preparar(usuarioId: string, empresaId: string, datos: CalcularPlanilla): Promise<PreparacionPlanilla>;
  guardarCalculo(
    usuarioId: string,
    empresaId: string,
    periodo: string,
    sucursalId: string,
    partidaId: string,
    empleados: readonly import("@contable/shared").EmpleadoPlanillaVista[],
  ): Promise<void>;
}

export class EmpresaPlanillaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}

export class SucursalPlanillaNoAutorizadaError extends Error {
  constructor() {
    super("No tiene acceso a la sucursal indicada.");
  }
}

export class SinPermisoCalculoPlanillaError extends Error {
  constructor() {
    super("Su rol no permite calcular planillas en esta empresa.");
  }
}

export class CuentaPlanillaInvalidaError extends Error {
  constructor(readonly codigo?: string) {
    super(
      codigo
        ? `La cuenta ${codigo} debe estar activa y ser de último nivel.`
        : "Seleccione una cuenta de gasto activa e imputable del grupo de gastos.",
    );
  }
}

export class ConfiguracionPlanillaNoEncontradaError extends Error {
  constructor() {
    super("No hay tasas de planilla vigentes para el período seleccionado.");
  }
}

export class SinEmpleadosPlanillaError extends Error {
  constructor() {
    super("No hay empleados activos para calcular en la sucursal y el período seleccionados.");
  }
}

export class DatosPlanillaInvalidosError extends Error {}

export class PartidaPlanillaNoEditableError extends Error {
  constructor(estado: EstadoPartida) {
    super("La planilla de este período ya está " + estado + "; no se puede recalcular.");
  }
}

export class PlanillaYaPresentadaError extends Error {
  constructor() {
    super("La planilla ya fue presentada y no se puede recalcular.");
  }
}
