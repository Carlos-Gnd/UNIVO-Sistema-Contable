import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearEmpleado, EditarEmpleado, EmpleadoVista } from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
const clave = (empresaId: string) => ["empresas", empresaId, "planilla", "empleados"] as const;

export interface FiltrosEmpleados {
  estado: "todos" | "activos" | "inactivos";
}

export const empleadosQuery = (empresaId: string, filtros: FiltrosEmpleados) => {
  const q = new URLSearchParams();
  if (filtros.estado !== "todos") q.set("activo", String(filtros.estado === "activos"));
  const texto = q.toString();
  return queryOptions({
    queryKey: [...clave(empresaId), filtros] as const,
    queryFn: ({ signal }) =>
      api<EmpleadoVista[]>(`${base(empresaId)}/empleados${texto ? `?${texto}` : ""}`, { senal: signal }),
  });
};

function useRefrescar(empresaId: string) {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: clave(empresaId) });
}

export function useCrearEmpleado(empresaId: string) {
  const refrescar = useRefrescar(empresaId);
  return useMutation({
    mutationFn: (datos: CrearEmpleado) =>
      api<EmpleadoVista>(`${base(empresaId)}/empleados`, { metodo: "POST", cuerpo: datos }),
    onSuccess: refrescar,
  });
}

export function useEditarEmpleado(empresaId: string) {
  const refrescar = useRefrescar(empresaId);
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: EditarEmpleado }) =>
      api<EmpleadoVista>(`${base(empresaId)}/empleados/${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        cuerpo: cambios,
      }),
    onSuccess: refrescar,
  });
}
