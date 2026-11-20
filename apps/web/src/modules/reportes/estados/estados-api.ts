import { queryOptions } from "@tanstack/react-query";
import type { EstadoResultados } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte } from "../comun/periodo";

export interface FiltrosEstadoResultados {
  desde: string;
  hasta: string;
  /** Vacío = consolidado */
  sucursalId: string;
}

/** Estado de resultados del período, de una sucursal o consolidado (S2-T42, HU-37). */
export const estadoResultadosQuery = (empresaId: string, f: FiltrosEstadoResultados) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "estados", "resultados", f.desde, f.hasta, f.sucursalId] as const,
    queryFn: ({ signal }) =>
      api<EstadoResultados>(
        `/empresas/${encodeURIComponent(empresaId)}/estados/resultados${consultaReporte({
          desde: f.desde,
          hasta: f.hasta,
          ...(f.sucursalId ? { sucursalId: f.sucursalId } : {}),
        })}`,
        { senal: signal },
      ),
  });
