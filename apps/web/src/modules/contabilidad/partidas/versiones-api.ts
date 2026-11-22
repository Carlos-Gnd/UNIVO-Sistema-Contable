import { queryOptions } from "@tanstack/react-query";
import type { PartidaVersionVista } from "@contable/shared";
import { api } from "@/lib/api";
import { clavesPartidas } from "./partidas-api";

/** Versiones anteriores de una partida, de la más reciente a la más antigua (S2-T07, HU-23). */
export const versionesQuery = (empresaId: string, partidaId: string) =>
  queryOptions({
    queryKey: [...clavesPartidas.una(empresaId, partidaId), "versiones"] as const,
    queryFn: ({ signal }) =>
      api<PartidaVersionVista[]>(
        `/empresas/${encodeURIComponent(empresaId)}/partidas/${encodeURIComponent(partidaId)}/versiones`,
        { senal: signal },
      ),
  });
