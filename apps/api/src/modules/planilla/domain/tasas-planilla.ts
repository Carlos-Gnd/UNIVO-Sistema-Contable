import type { ConfiguracionPlanillaVista, CrearConfiguracionPlanilla } from "@contable/shared";

export class EmpresaTasasPlanillaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tienes acceso a ella.");
  }
}

export class ConfiguracionPlanillaDuplicadaError extends Error {
  constructor() {
    super("Ya existe una configuración de planilla para esa fecha.");
  }
}

export class ReglaTasasPlanillaError extends Error {}

export interface UnidadTasasPlanilla {
  configuraciones(usuarioId: string, empresaId: string): Promise<ConfiguracionPlanillaVista[]>;
  crear(
    usuarioId: string,
    empresaId: string,
    datos: CrearConfiguracionPlanilla,
  ): Promise<ConfiguracionPlanillaVista>;
}

export interface RepositorioTasasPlanilla {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadTasasPlanilla) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_TASAS_PLANILLA = Symbol("REPOSITORIO_TASAS_PLANILLA");
