import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ActivoFijoVista,
  CrearActivoFijoEntrada,
  DarBajaActivo,
  ResultadoAltaActivo,
  ResultadoBajaActivo,
} from "@contable/shared";
import { api } from "@/lib/api";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/activos-fijos`;

export const clavesActivos = {
  todos: (empresaId: string) => ["empresas", empresaId, "activos-fijos"] as const,
};

export const activosQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clavesActivos.todos(empresaId),
    queryFn: ({ signal }) => api<ActivoFijoVista[]>(ruta(empresaId), { senal: signal }),
  });

/** Registra un activo; con contrapartida la API genera y contabiliza su partida de adquisición (S3-T127). */
export function useRegistrarActivo(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearActivoFijoEntrada) =>
      api<ResultadoAltaActivo>(ruta(empresaId), { metodo: "POST", cuerpo: datos }),
    // Cambian los activos, las partidas y los reportes: se refresca todo lo de la empresa
    onSettled: () => cliente.invalidateQueries({ queryKey: ["empresas", empresaId] }),
  });
}

export function useDarDeBaja(empresaId: string, activoId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: DarBajaActivo) =>
      api<ResultadoBajaActivo>(`${ruta(empresaId)}/${encodeURIComponent(activoId)}/baja`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSettled: () => cliente.invalidateQueries({ queryKey: ["empresas", empresaId] }),
  });
}
