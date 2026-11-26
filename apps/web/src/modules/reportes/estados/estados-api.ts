import { queryOptions } from "@tanstack/react-query";
import type { EstadoResultados } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte, type FiltrosEstado } from "../comun/periodo";

export type FiltrosEstadoResultados = FiltrosEstado;

/** Estado de resultados del período, de una sucursal o consolidado (S2-T42, HU-37). */
export const estadoResultadosQuery = (empresaId: string, f: FiltrosEstadoResultados) =>
  queryOptions({
    queryKey: [
      "empresas",
      empresaId,
      "estados",
      "resultados",
      f.desde,
      f.hasta,
      f.sucursalId,
      f.formato,
    ] as const,
    queryFn: ({ signal }) =>
      api<EstadoResultados>(
        `/empresas/${encodeURIComponent(empresaId)}/estados/resultados${consultaReporte({
          desde: f.desde,
          hasta: f.hasta,
          ...(f.sucursalId ? { sucursalId: f.sucursalId } : {}),
          ...(f.formato ? { formato: f.formato } : {}),
        })}`,
        { senal: signal },
      ),
  });
