import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearEmpresaEntrada, EditarEmpresaEntrada, EmpresaDetalle } from "@contable/shared";
import { api } from "@/lib/api";

const clave = (empresaId: string) => ["empresas", empresaId, "detalle"] as const;

export const empresaQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) =>
      api<EmpresaDetalle>(`/empresas/${encodeURIComponent(empresaId)}`, { senal: signal }),
  });

/** Registra la empresa con su casa matriz y su catálogo; quien la crea queda como administrador (S1-T38). */
export function useRegistrarEmpresa() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearEmpresaEntrada) =>
      api<EmpresaDetalle>("/empresas", { metodo: "POST", cuerpo: datos }),
    onSuccess: (empresa) => cliente.setQueryData(clave(empresa.id), empresa),
  });
}

/** Edita solo los campos enviados (PATCH, S1-T38). */
export function useEditarEmpresa(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (cambios: EditarEmpresaEntrada) =>
      api<EmpresaDetalle>(`/empresas/${encodeURIComponent(empresaId)}`, { metodo: "PATCH", cuerpo: cambios }),
    onSuccess: (empresa) => cliente.setQueryData(clave(empresaId), empresa),
  });
}
