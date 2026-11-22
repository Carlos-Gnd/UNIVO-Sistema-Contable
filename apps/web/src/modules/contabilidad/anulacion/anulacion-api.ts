import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AnularPartida, ResultadoAnulacion } from "@contable/shared";
import { api } from "@/lib/api";
import { clavesPartidas } from "../partidas/partidas-api";

/** Anula una partida contabilizada con su reversión (S2-T12). */
export const anularPartida = (empresaId: string, partidaId: string, datos: AnularPartida) =>
  api<ResultadoAnulacion>(
    `/empresas/${encodeURIComponent(empresaId)}/partidas/${encodeURIComponent(partidaId)}/anular`,
    { metodo: "POST", cuerpo: datos },
  );

/** Al anular cambian la partida, su reversión y los libros: se refresca todo lo de partidas. */
export function useAnularPartida(empresaId: string, partidaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: AnularPartida) => anularPartida(empresaId, partidaId, datos),
    onSettled: () => cliente.invalidateQueries({ queryKey: clavesPartidas.todas(empresaId) }),
  });
}
