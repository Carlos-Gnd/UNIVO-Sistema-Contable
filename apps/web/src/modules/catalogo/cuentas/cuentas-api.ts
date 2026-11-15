import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearCuentaEntrada, EditarCuenta } from "@contable/shared";
import { api } from "@/lib/api";
import type { CuentaCatalogo } from "./tipos";

const rutaCuentas = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/cuentas`;
const claveCuentas = (empresaId: string) => ["empresas", empresaId, "cuentas"] as const;

export const cuentasCatalogoQuery = (empresaId: string) =>
  queryOptions({
    queryKey: claveCuentas(empresaId),
    queryFn: ({ signal }) => api<CuentaCatalogo[]>(rutaCuentas(empresaId), { senal: signal }),
    staleTime: 5 * 60_000,
  });

/** Crea una cuenta y actualiza el catálogo cacheado para que la vista se refresque al instante. */
export function useCrearCuenta(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearCuentaEntrada) =>
      api<CuentaCatalogo>(rutaCuentas(empresaId), { metodo: "POST", cuerpo: datos }),
    onSuccess: (creada) => {
      cliente.setQueryData<CuentaCatalogo[]>(claveCuentas(empresaId), (cuentas = []) =>
        [...cuentas.filter((cuenta) => cuenta.id !== creada.id), creada].sort((a, b) =>
          a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
        ),
      );
      void cliente.invalidateQueries({ queryKey: claveCuentas(empresaId), exact: true });
    },
  });
}

/** Edita una cuenta mediante PATCH /empresas/:empresaId/cuentas/:cuentaId. */
export function useEditarCuenta(empresaId: string, cuentaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (cambios: EditarCuenta) =>
      api<CuentaCatalogo>(`${rutaCuentas(empresaId)}/${encodeURIComponent(cuentaId)}`, {
        metodo: "PATCH",
        cuerpo: cambios,
      }),
    onSuccess: (actualizada) => {
      cliente.setQueryData<CuentaCatalogo[]>(claveCuentas(empresaId), (cuentas = []) =>
        [...cuentas.filter((cuenta) => cuenta.id !== actualizada.id), actualizada].sort((a, b) =>
          a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
        ),
      );
      void cliente.invalidateQueries({ queryKey: claveCuentas(empresaId), exact: true });
    },
  });
}
