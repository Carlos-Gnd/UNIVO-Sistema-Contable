import { queryOptions } from "@tanstack/react-query";
import type { RetencionPercepcionVista } from "@contable/shared";
import { api } from "@/lib/api";

export const retencionPercepcionQuery = (empresaId: string, anio: number, mes: number) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "retencion-percepcion", anio, mes],
    queryFn: ({ signal }) =>
      api<RetencionPercepcionVista>(
        `/empresas/${encodeURIComponent(empresaId)}/retencion-percepcion?anio=${anio}&mes=${mes}`,
        { senal: signal },
      ),
    enabled: Boolean(empresaId),
  });
