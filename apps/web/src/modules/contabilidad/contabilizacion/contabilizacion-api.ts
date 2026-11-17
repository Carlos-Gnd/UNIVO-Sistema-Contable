import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PartidaContabilizada, ResultadoContabilizacion } from "@contable/shared";
import { api } from "@/lib/api";

const partidas = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/partidas`;

/** Contabiliza un borrador: le asigna el siguiente número correlativo (S1-T84). */
export const contabilizarPartida = (empresaId: string, partidaId: string) =>
  api<PartidaContabilizada>(`${partidas(empresaId)}/${encodeURIComponent(partidaId)}/contabilizar`, {
    metodo: "POST",
  });

/** Contabiliza varias desde la bandeja; responde cuáles recibieron número y cuáles no (S1-T85). */
export const contabilizarLote = (empresaId: string, ids: readonly string[]) =>
  api<ResultadoContabilizacion>(`${partidas(empresaId)}/contabilizar`, { metodo: "POST", cuerpo: { ids } });

/** Al contabilizar cambian las partidas, la bandeja y los libros: se refresca todo lo de partidas. */
function useRefrescarPartidas(empresaId: string) {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "partidas"] });
}

export function useContabilizarPartida(empresaId: string) {
  const refrescar = useRefrescarPartidas(empresaId);
  return useMutation({
    mutationFn: (partidaId: string) => contabilizarPartida(empresaId, partidaId),
    onSettled: refrescar,
  });
}

export function useContabilizarLote(empresaId: string) {
  const refrescar = useRefrescarPartidas(empresaId);
  return useMutation({
    mutationFn: (ids: readonly string[]) => contabilizarLote(empresaId, ids),
    onSettled: refrescar,
  });
}
