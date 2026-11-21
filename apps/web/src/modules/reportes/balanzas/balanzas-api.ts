import { queryOptions } from "@tanstack/react-query";
import type { Balanza, TipoBalanza } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte } from "../comun/periodo";

export interface FiltrosBalanza {
  tipo: TipoBalanza;
  desde: string;
  hasta: string;
  /** Vacío = consolidada */
  sucursalId: string;
}

/** Balanza de comprobación del período, de una sucursal o consolidada (S2-T29, HU-30). */
export const balanzaQuery = (empresaId: string, f: FiltrosBalanza) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "balanzas", f.tipo, f.desde, f.hasta, f.sucursalId] as const,
    queryFn: ({ signal }) =>
      api<Balanza>(
        `/empresas/${encodeURIComponent(empresaId)}/balanzas/${f.tipo}${consultaReporte({
          desde: f.desde,
          hasta: f.hasta,
          ...(f.sucursalId ? { sucursalId: f.sucursalId } : {}),
        })}`,
        { senal: signal },
      ),
  });
