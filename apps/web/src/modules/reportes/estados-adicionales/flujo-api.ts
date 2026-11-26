import { queryOptions } from "@tanstack/react-query";
import type { EstadoFlujoEfectivo } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte, type FiltrosEstado } from "../comun/periodo";

/** Estado de flujo de efectivo del período, de una sucursal o consolidado (S3-T22, HU-41). */
export const flujoEfectivoQuery = (empresaId: string, f: FiltrosEstado) =>
  queryOptions({
    queryKey: [
      "empresas",
      empresaId,
      "estados",
      "flujo-efectivo",
      f.desde,
      f.hasta,
      f.sucursalId,
      f.formato,
    ] as const,
    queryFn: ({ signal }) =>
      api<EstadoFlujoEfectivo>(
        `/empresas/${encodeURIComponent(empresaId)}/estados/flujo-efectivo${consultaReporte({
          desde: f.desde,
          hasta: f.hasta,
          ...(f.sucursalId ? { sucursalId: f.sucursalId } : {}),
          ...(f.formato ? { formato: f.formato } : {}),
        })}`,
        { senal: signal },
      ),
  });
