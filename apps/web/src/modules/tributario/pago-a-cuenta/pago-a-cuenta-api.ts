import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PagoACuentaVista, PagosACuentaEjercicioVista } from "@contable/shared";
import { api } from "@/lib/api";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/pago-a-cuenta`;
const clave = (empresaId: string) => ["empresas", empresaId, "pago-a-cuenta"] as const;

export const pagoACuentaQuery = (empresaId: string, anio: number, mes: number) =>
  queryOptions({
    queryKey: [...clave(empresaId), "mes", anio, mes],
    queryFn: ({ signal }) =>
      api<PagoACuentaVista>(`${ruta(empresaId)}?anio=${anio}&mes=${mes}`, { senal: signal }),
    enabled: Boolean(empresaId),
  });

export const pagosACuentaEjercicioQuery = (empresaId: string, anio: number) =>
  queryOptions({
    queryKey: [...clave(empresaId), "ejercicio", anio],
    queryFn: ({ signal }) =>
      api<PagosACuentaEjercicioVista>(`${ruta(empresaId)}/ejercicios/${anio}`, { senal: signal }),
    enabled: Boolean(empresaId),
  });

function useAccionMes(empresaId: string, camino: "partida" | "presentar") {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (periodo: { anio: number; mes: number }) =>
      api<PagoACuentaVista>(`${ruta(empresaId)}/${camino}`, { metodo: "POST", cuerpo: periodo }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

export const useGenerarPartidaPagoACuenta = (empresaId: string) => useAccionMes(empresaId, "partida");
export const usePresentarPagoACuenta = (empresaId: string) => useAccionMes(empresaId, "presentar");
