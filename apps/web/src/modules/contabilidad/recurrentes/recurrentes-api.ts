import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CrearPlantillaRecurrente,
  EditarPlantillaRecurrente,
  GenerarPartidaRecurrente,
  PartidaDisponibleVista,
  PartidaGeneradaVista,
  PlantillaRecurrenteVista,
  ResultadoGenerarMesVista,
} from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/partidas-recurrentes`;
const clave = (empresaId: string) => ["empresas", empresaId, "partidas-recurrentes"] as const;

export const recurrentesQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) => api<PlantillaRecurrenteVista[]>(base(empresaId), { senal: signal }),
  });

export function useCrearPlantillaRecurrente(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearPlantillaRecurrente) =>
      api<PlantillaRecurrenteVista>(base(empresaId), { metodo: "POST", cuerpo: datos }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

export function useEditarPlantillaRecurrente(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: EditarPlantillaRecurrente }) =>
      api<PlantillaRecurrenteVista>(`${base(empresaId)}/${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        cuerpo: cambios,
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

export function useGenerarPartidaRecurrente(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: GenerarPartidaRecurrente }) =>
      api<PartidaGeneradaVista>(`${base(empresaId)}/${encodeURIComponent(id)}/generar`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

export const partidasDisponiblesQuery = (empresaId: string) =>
  queryOptions({
    queryKey: [...clave(empresaId), "partidas-disponibles"] as const,
    queryFn: ({ signal }) =>
      api<PartidaDisponibleVista[]>(`${base(empresaId)}/partidas-disponibles`, { senal: signal }),
  });

export function useGenerarMesRecurrentes(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: GenerarPartidaRecurrente) =>
      api<ResultadoGenerarMesVista>(`${base(empresaId)}/generar-mes`, { metodo: "POST", cuerpo: datos }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}
