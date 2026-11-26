import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CuadroActivo, ResultadoDepreciacion, VistaDepreciacionMes } from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;

export const depreciacionQuery = (empresaId: string, mes: string) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "depreciacion", mes] as const,
    queryFn: ({ signal }) =>
      api<VistaDepreciacionMes>(`${base(empresaId)}/depreciacion?mes=${encodeURIComponent(mes)}`, {
        senal: signal,
      }),
  });

export const cuadroQuery = (empresaId: string, activoId: string) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "depreciacion", "cuadro", activoId] as const,
    queryFn: ({ signal }) =>
      api<CuadroActivo>(`${base(empresaId)}/activos-fijos/${encodeURIComponent(activoId)}/cuadro`, {
        senal: signal,
      }),
  });

/** Genera y contabiliza la depreciación del mes (S3-T130); cambian los activos, las partidas y los reportes. */
export function useGenerarDepreciacion(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (mes: string) =>
      api<ResultadoDepreciacion>(`${base(empresaId)}/depreciacion`, { metodo: "POST", cuerpo: { mes } }),
    onSettled: () => cliente.invalidateQueries({ queryKey: ["empresas", empresaId] }),
  });
}

/** Meses que se pueden depreciar: desde el actual hacia atrás (más reciente primero), como AAAA-MM. */
export function mesesDisponibles(hoy: string, cantidad = 24): string[] {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  return Array.from({ length: cantidad }, (_, i) => {
    const total = anio * 12 + (mes - 1) - i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}
