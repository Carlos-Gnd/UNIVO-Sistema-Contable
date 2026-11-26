import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LiquidacionIvaVista } from "@contable/shared";
import { api } from "@/lib/api";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/liquidacion-iva`;
const clave = (empresaId: string) => ["empresas", empresaId, "liquidacion-iva"] as const;

export const liquidacionIvaQuery = (empresaId: string, anio: number, mes: number) =>
  queryOptions({
    queryKey: [...clave(empresaId), "mes", anio, mes],
    queryFn: ({ signal }) =>
      api<LiquidacionIvaVista>(`${ruta(empresaId)}?anio=${anio}&mes=${mes}`, { senal: signal }),
    enabled: Boolean(empresaId),
  });

function useAccionMes(empresaId: string, camino: "partida" | "presentar") {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (periodo: { anio: number; mes: number }) =>
      api<LiquidacionIvaVista>(`${ruta(empresaId)}/${camino}`, { metodo: "POST", cuerpo: periodo }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

export const useGenerarPartidaLiquidacionIva = (empresaId: string) => useAccionMes(empresaId, "partida");
export const usePresentarLiquidacionIva = (empresaId: string) => useAccionMes(empresaId, "presentar");
