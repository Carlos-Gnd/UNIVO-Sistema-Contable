import type { EstadoPeriodo } from "@contable/shared";

/**
 * Contrato esperado de la API de ejercicios (S1-T74), con los campos del modelo Prisma Ejercicio y
 * Periodo. Fechas en AAAA-MM-DD; cerradoEn en ISO 8601.
 *
 *   GET  /empresas/:empresaId/ejercicios  → EjercicioDetalle[]
 *   POST /empresas/:empresaId/ejercicios  ← crearEjercicioSchema → EjercicioDetalle (con sus 12 períodos)
 */
export interface PeriodoDetalle {
  id: string;
  /** 1 a 12 */
  mes: number;
  fechaInicio: string;
  fechaFin: string;
  estado: EstadoPeriodo;
  cerradoEn: string | null;
  motivoReapertura: string | null;
}

export interface EjercicioDetalle {
  id: string;
  anio: number;
  fechaInicio: string;
  fechaFin: string;
  estado: EstadoPeriodo;
  periodos: PeriodoDetalle[];
}
