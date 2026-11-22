import { queryOptions } from "@tanstack/react-query";
import type { PartidaVista } from "@contable/shared";
import { api } from "@/lib/api";
import { clavesPartidas } from "../partidas/partidas-api";

/**
 * Borradores de las sucursales visibles con su diferencia debe/haber (S1-T82). La clave cuelga de las partidas:
 * al guardar o contabilizar una partida se invalidan y la bandeja se actualiza sola.
 */
export const borradoresQuery = (empresaId: string) =>
  queryOptions({
    queryKey: [...clavesPartidas.todas(empresaId), "borradores"] as const,
    queryFn: ({ signal }) =>
      api<PartidaVista[]>(`/empresas/${encodeURIComponent(empresaId)}/partidas/borradores`, {
        senal: signal,
      }),
    // Al volver a la bandeja después de guardar un borrador se pide de nuevo: la caché puede tener 30 s
    refetchOnMount: "always",
  });
