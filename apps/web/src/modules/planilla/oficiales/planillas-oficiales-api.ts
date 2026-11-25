import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  PresentarPlanillaOficial,
  PresentacionPlanillaOficialVista,
  ResultadoPlanillasOficialesVista,
} from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/planillas-oficiales`;
const clave = (empresaId: string) => ["empresas", empresaId, "planilla", "oficiales"] as const;

export const planillasOficialesQuery = (empresaId: string, periodo: string) =>
  queryOptions({
    queryKey: [...clave(empresaId), periodo] as const,
    queryFn: ({ signal }) =>
      api<ResultadoPlanillasOficialesVista>(`${base(empresaId)}?periodo=${encodeURIComponent(periodo)}`, {
        senal: signal,
      }),
  });

export function usePresentarPlanillaOficial(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: PresentarPlanillaOficial) =>
      api<PresentacionPlanillaOficialVista>(`${base(empresaId)}/presentar`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}
