import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearTercero, EditarTercero, RolTercero, TerceroVista } from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
export const claveTerceros = (empresaId: string) => ["empresas", empresaId, "terceros"] as const;

export interface FiltrosTerceros {
  rol: RolTercero;
  busqueda: string;
  estado: "todos" | "activos" | "inactivos";
}

/** Clientes o proveedores de la empresa; los filtros los resuelve la API. */
export const tercerosQuery = (empresaId: string, filtros: FiltrosTerceros) => {
  const q = new URLSearchParams({ rol: filtros.rol });
  if (filtros.busqueda.trim()) q.set("busqueda", filtros.busqueda.trim());
  if (filtros.estado !== "todos") q.set("activo", String(filtros.estado === "activos"));
  return queryOptions({
    queryKey: [...claveTerceros(empresaId), "lista", filtros] as const,
    queryFn: ({ signal }) =>
      api<TerceroVista[]>(`${base(empresaId)}/terceros?${q.toString()}`, { senal: signal }),
  });
};

function useRefrescar(empresaId: string) {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: claveTerceros(empresaId) });
}

export function useCrearTercero(empresaId: string) {
  const refrescar = useRefrescar(empresaId);
  return useMutation({
    mutationFn: (datos: CrearTercero) =>
      api<TerceroVista>(`${base(empresaId)}/terceros`, { metodo: "POST", cuerpo: datos }),
    onSuccess: refrescar,
  });
}

export function useEditarTercero(empresaId: string) {
  const refrescar = useRefrescar(empresaId);
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: EditarTercero }) =>
      api<TerceroVista>(`${base(empresaId)}/terceros/${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        cuerpo: cambios,
      }),
    onSuccess: refrescar,
  });
}
