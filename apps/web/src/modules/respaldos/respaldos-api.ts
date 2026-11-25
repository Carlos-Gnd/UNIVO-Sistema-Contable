import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearRespaldo, RespaldoVista, ResultadoRestauracionRespaldo } from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/respaldos`;
const clave = (empresaId: string) => ["empresas", empresaId, "respaldos"] as const;

export const respaldosQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) => api<RespaldoVista[]>(base(empresaId), { senal: signal }),
  });

export function useCrearRespaldo(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearRespaldo) =>
      api<RespaldoVista>(base(empresaId), { metodo: "POST", cuerpo: datos }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

export function useRestaurarRespaldo(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (respaldoId: string) =>
      api<ResultadoRestauracionRespaldo>(`${base(empresaId)}/${encodeURIComponent(respaldoId)}/restaurar`, {
        metodo: "POST",
        cuerpo: { confirmacion: "RESTAURAR" },
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}
