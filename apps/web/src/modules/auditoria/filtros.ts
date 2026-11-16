import {
  MODULOS_BITACORA,
  POR_PAGINA_BITACORA,
  accionBitacoraSchema,
  type AccionBitacora,
  type FiltrosBitacoraEntrada,
  type ModuloBitacora,
} from "@contable/shared";
import type { RangoFechas } from "./presentacion";

export interface FiltrosPantalla {
  usuario?: { id: string; nombre: string };
  modulo?: ModuloBitacora;
  accion?: AccionBitacora;
  rango: RangoFechas;
  desde?: string;
  hasta?: string;
}

export const FILTROS_INICIALES: FiltrosPantalla = { rango: "todas" };

export const MODULOS = Object.keys(MODULOS_BITACORA) as ModuloBitacora[];
export const ACCIONES = accionBitacoraSchema.options;
export const RANGOS: RangoFechas[] = ["todas", "hoy", "semana", "mes", "personalizado"];

/** La fecha inicial no puede ser posterior a la final (la API también lo rechaza). */
export const rangoInvalido = (f: FiltrosPantalla) => !!(f.desde && f.hasta && f.desde > f.hasta);

export const hayFiltros = (f: FiltrosPantalla) =>
  !!(f.usuario || f.modulo || f.accion || f.rango !== "todas");

/** Filtros de la pantalla como los recibe la API. */
export function aConsulta(filtros: FiltrosPantalla, pagina: number): FiltrosBitacoraEntrada {
  return {
    usuarioId: filtros.usuario?.id,
    modulo: filtros.modulo,
    accion: filtros.accion,
    desde: filtros.desde,
    hasta: filtros.hasta,
    pagina,
    porPagina: POR_PAGINA_BITACORA.inicial,
  };
}
