import type {
  PresentarPlanillaOficial,
  PresentacionPlanillaOficialVista,
  ResultadoPlanillasOficialesVista,
} from "@contable/shared";

export class EmpresaPlanillaOficialNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tienes acceso.");
  }
}

export class SinAccesoCompletoPlanillaError extends Error {
  constructor() {
    super("Necesitas acceso a todas las sucursales para consultar o presentar las planillas oficiales.");
  }
}

export class SinDatosPlanillaOficialError extends Error {
  constructor() {
    super("Primero calcula la planilla de todas las sucursales del período.");
  }
}

export class PlanillaOficialYaPresentadaError extends Error {
  constructor() {
    super("La planilla de esta institución ya fue presentada para el período.");
  }
}

export interface RepositorioPlanillasOficiales {
  consultar(usuarioId: string, empresaId: string, periodo: string): Promise<ResultadoPlanillasOficialesVista>;
  presentar(
    usuarioId: string,
    empresaId: string,
    datos: PresentarPlanillaOficial,
  ): Promise<PresentacionPlanillaOficialVista>;
}

export const REPOSITORIO_PLANILLAS_OFICIALES = Symbol("REPOSITORIO_PLANILLAS_OFICIALES");
