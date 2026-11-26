import type { FormatoEstados } from "@contable/shared";
import { hoyIso } from "@/lib/formato";
import { TEXTOS_REPORTES } from "./textos";

/** Primer y último día del mes de la fecha dada (AAAA-MM-DD), para proponer el período de un reporte. */
export function mesDe(fecha: string = hoyIso()): { desde: string; hasta: string } {
  const [anio, mes] = fecha.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, "0");
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

/** Texto de la consulta con los filtros que tienen valor, en orden fijo (también sirve de clave de caché). */
export function consultaReporte(filtros: {
  desde: string;
  hasta: string;
  sucursalId?: string;
  formato?: string;
}): string {
  const q = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta });
  if (filtros.sucursalId) q.set("sucursalId", filtros.sucursalId);
  if (filtros.formato) q.set("formato", filtros.formato);
  return `?${q.toString()}`;
}

export interface FiltrosReporte {
  desde: string;
  hasta: string;
  /** Vacío = consolidado */
  sucursalId: string;
}

/** Filtros de un estado financiero: además del período, el formato en que se presenta (HU-42). */
export interface FiltrosEstado extends FiltrosReporte {
  /** Vacío = el formato configurado en la empresa */
  formato: FormatoEstados | "";
}

/** Mensaje de error de los filtros, o undefined si se puede consultar. */
export function errorDeFiltros(f: FiltrosReporte): string | undefined {
  if (!f.desde || !f.hasta) return TEXTOS_REPORTES.filtros.fechaRequerida;
  if (f.desde > f.hasta) return TEXTOS_REPORTES.filtros.rangoInvalido;
  return undefined;
}
