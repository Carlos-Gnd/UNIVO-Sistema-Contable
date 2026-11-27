import { queryOptions } from "@tanstack/react-query";
import type { EstadoComparable, EstadoComparativo, FormatoEstados } from "@contable/shared";
import { api } from "@/lib/api";

export interface FiltrosComparativo {
  estado: EstadoComparable;
  desdeA: string;
  hastaA: string;
  desdeB: string;
  hastaB: string;
  /** Vacío = consolidado */
  sucursalId: string;
  /** Vacío = el formato configurado en la empresa */
  formato: FormatoEstados | "";
}

/** Estado comparativo de dos períodos con variación absoluta y porcentual (S3-T28, HU-43). */
export const comparativoQuery = (empresaId: string, f: FiltrosComparativo) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "estados", "comparativo", f] as const,
    queryFn: ({ signal }) => {
      const q = new URLSearchParams({ estado: f.estado, hastaA: f.hastaA, hastaB: f.hastaB });
      // El balance general compara fechas: solo cuenta la final de cada período
      if (f.estado === "resultados") {
        q.set("desdeA", f.desdeA);
        q.set("desdeB", f.desdeB);
      }
      if (f.sucursalId) q.set("sucursalId", f.sucursalId);
      if (f.formato) q.set("formato", f.formato);
      return api<EstadoComparativo>(
        `/empresas/${encodeURIComponent(empresaId)}/estados/comparativo?${q.toString()}`,
        { senal: signal },
      );
    },
  });
