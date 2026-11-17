import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearSucursalEntrada, EditarSucursalEntrada, SucursalDetalle } from "@contable/shared";
import { api } from "@/lib/api";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/sucursales`;
const clave = (empresaId: string) => ["empresas", empresaId, "sucursales"] as const;

/** Sucursales que el usuario puede ver en la empresa (S1-T43). */
export const sucursalesQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) => api<SucursalDetalle[]>(ruta(empresaId), { senal: signal }),
  });

/** Casa matriz primero, luego las activas y después las inactivas, cada grupo por nombre. */
export function ordenarSucursales(sucursales: readonly SucursalDetalle[]): SucursalDetalle[] {
  const peso = (s: SucursalDetalle) => (s.esMatriz ? 0 : s.activa ? 1 : 2);
  return [...sucursales].sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Reemplaza la sucursal guardada en la lista en caché (o la agrega) sin volver a pedir todo. */
function useActualizarLista(empresaId: string) {
  const cliente = useQueryClient();
  return (guardada: SucursalDetalle) => {
    cliente.setQueryData<SucursalDetalle[]>(clave(empresaId), (lista = []) =>
      lista.some((s) => s.id === guardada.id)
        ? lista.map((s) => (s.id === guardada.id ? guardada : s))
        : [...lista, guardada],
    );
    // Otras pantallas (selector de sucursal, partidas) se enteran del cambio
    void cliente.invalidateQueries({ queryKey: clave(empresaId) });
  };
}

export function useCrearSucursal(empresaId: string) {
  const actualizar = useActualizarLista(empresaId);
  return useMutation({
    mutationFn: (datos: CrearSucursalEntrada) =>
      api<SucursalDetalle>(ruta(empresaId), { metodo: "POST", cuerpo: datos }),
    onSuccess: actualizar,
  });
}

export function useEditarSucursal(empresaId: string) {
  const actualizar = useActualizarLista(empresaId);
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: EditarSucursalEntrada }) =>
      api<SucursalDetalle>(`${ruta(empresaId)}/${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        cuerpo: cambios,
      }),
    onSuccess: actualizar,
  });
}
