import { queryOptions } from "@tanstack/react-query";
import type { LibroDiario, TipoPartida } from "@contable/shared";
import { api } from "@/lib/api";

export interface FiltrosLibroDiario {
  desde: string;
  hasta: string;
  /** Vacío = consolidado */
  sucursalId: string;
  /** Vacío = todos los tipos */
  tipo: TipoPartida | "";
  renglonesPorPagina: number;
}

/** Texto de la consulta con los filtros que tienen valor. */
export function consultaLibroDiario(f: FiltrosLibroDiario): string {
  const q = new URLSearchParams({
    desde: f.desde,
    hasta: f.hasta,
    renglonesPorPagina: String(f.renglonesPorPagina),
  });
  if (f.sucursalId) q.set("sucursalId", f.sucursalId);
  if (f.tipo) q.set("tipo", f.tipo);
  return `?${q.toString()}`;
}

/** Libro diario en el formato de clase, ya foliado con Vienen y Pasan (S2-T15 y S2-T16). */
export const libroDiarioQuery = (empresaId: string, f: FiltrosLibroDiario) =>
  queryOptions({
    queryKey: [
      "empresas",
      empresaId,
      "libro-diario",
      f.desde,
      f.hasta,
      f.sucursalId,
      f.tipo,
      f.renglonesPorPagina,
    ] as const,
    queryFn: ({ signal }) =>
      api<LibroDiario>(`/empresas/${encodeURIComponent(empresaId)}/libro-diario${consultaLibroDiario(f)}`, {
        senal: signal,
      }),
  });
