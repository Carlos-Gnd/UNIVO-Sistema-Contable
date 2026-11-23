import { queryOptions } from "@tanstack/react-query";
import type { HojaTrabajo } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte } from "../comun/periodo";

export interface FiltrosHojaTrabajo {
  desde: string;
  hasta: string;
  /** Vacío = consolidada */
  sucursalId: string;
}

/** Hoja de trabajo de diez columnas del período, de una sucursal o consolidada (S2-T34, HU-31). */
export const hojaTrabajoQuery = (empresaId: string, f: FiltrosHojaTrabajo) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "hoja-trabajo", f.desde, f.hasta, f.sucursalId] as const,
    queryFn: ({ signal }) =>
      api<HojaTrabajo>(
        `/empresas/${encodeURIComponent(empresaId)}/hoja-trabajo${consultaReporte({
          desde: f.desde,
          hasta: f.hasta,
          ...(f.sucursalId ? { sucursalId: f.sucursalId } : {}),
        })}`,
        { senal: signal },
      ),
  });
