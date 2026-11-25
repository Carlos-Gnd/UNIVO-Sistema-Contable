import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearCuentaTesoreria, CuentaTesoreriaVista, EditarCuentaTesoreria } from "@contable/shared";
import { api } from "@/lib/api";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/cuentas-tesoreria`;
const clave = (empresaId: string) => ["empresas", empresaId, "cuentas-tesoreria"] as const;

/** Cajas y cuentas bancarias con su saldo actual (HU-76). */
export const cuentasTesoreriaQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) => api<CuentaTesoreriaVista[]>(ruta(empresaId), { senal: signal }),
  });

export function useCrearCuentaTesoreria(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearCuentaTesoreria) =>
      api<CuentaTesoreriaVista>(ruta(empresaId), { metodo: "POST", cuerpo: datos }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

export function useEditarCuentaTesoreria(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: EditarCuentaTesoreria }) =>
      api<CuentaTesoreriaVista>(`${ruta(empresaId)}/${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        cuerpo: cambios,
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}
