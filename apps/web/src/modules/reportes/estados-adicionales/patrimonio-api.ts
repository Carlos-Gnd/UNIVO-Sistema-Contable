import { queryOptions } from "@tanstack/react-query";
import type { EstadoCambiosPatrimonio } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte, type FiltrosEstado } from "../comun/periodo";

/** Estado de cambios en el patrimonio del período, de una sucursal o consolidado (S3-T19, HU-40). */
export const cambiosPatrimonioQuery = (empresaId: string, f: FiltrosEstado) =>
  queryOptions({
    queryKey: [
      "empresas",
      empresaId,
      "estados",
      "cambios-patrimonio",
      f.desde,
      f.hasta,
      f.sucursalId,
      f.formato,
    ] as const,
    queryFn: ({ signal }) =>
      api<EstadoCambiosPatrimonio>(
        `/empresas/${encodeURIComponent(empresaId)}/estados/cambios-patrimonio${consultaReporte({
          desde: f.desde,
          hasta: f.hasta,
          ...(f.sucursalId ? { sucursalId: f.sucursalId } : {}),
          ...(f.formato ? { formato: f.formato } : {}),
        })}`,
        { senal: signal },
      ),
  });
