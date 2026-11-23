import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EditarParametros, ParametrosEmpresa } from "@contable/shared";
import { api } from "@/lib/api";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/parametros`;
const clave = (empresaId: string) => ["empresas", empresaId, "parametros"] as const;

export const parametrosQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) => api<ParametrosEmpresa>(ruta(empresaId), { senal: signal }),
  });

export function useEditarParametros(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (cambios: EditarParametros) =>
      api<ParametrosEmpresa>(ruta(empresaId), { metodo: "PATCH", cuerpo: cambios }),
    onSuccess: (parametros) => cliente.setQueryData(clave(empresaId), parametros),
  });
}
