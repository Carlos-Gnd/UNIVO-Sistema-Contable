import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface EmpresaDisponible {
  id: string;
  nombre: string;
}

export const empresasDisponiblesQuery = () =>
  queryOptions({
    queryKey: ["empresas", "disponibles"] as const,
    queryFn: ({ signal }) => api<EmpresaDisponible[]>("/empresas/disponibles", { senal: signal }),
    staleTime: 5 * 60_000,
  });
