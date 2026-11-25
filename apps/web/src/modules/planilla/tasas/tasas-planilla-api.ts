import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConfiguracionPlanillaVista, CrearConfiguracionPlanilla } from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
const clave = (empresaId: string) => ["empresas", empresaId, "planilla", "tasas"] as const;

export const tasasPlanillaQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) =>
      api<ConfiguracionPlanillaVista[]>(`${base(empresaId)}/tasas-planilla`, { senal: signal }),
  });

export function useCrearConfiguracionPlanilla(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearConfiguracionPlanilla) =>
      api<ConfiguracionPlanillaVista>(`${base(empresaId)}/tasas-planilla`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}
