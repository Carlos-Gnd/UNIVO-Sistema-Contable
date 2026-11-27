import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface EmpresaDisponible {
  id: string;
  nombre: string;
  /** Es la empresa de demostración con el caso CheroPhonex (HU-86). */
  esDemostracion: boolean;
}

export const empresasDisponiblesQuery = () =>
  queryOptions({
    queryKey: ["empresas", "disponibles"] as const,
    queryFn: ({ signal }) => api<EmpresaDisponible[]>("/empresas/disponibles", { senal: signal }),
    staleTime: 5 * 60_000,
  });
