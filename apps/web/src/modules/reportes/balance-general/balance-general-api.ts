import { queryOptions } from "@tanstack/react-query";
import type { BalanceGeneral } from "@contable/shared";
import { api } from "@/lib/api";

export interface FiltrosBalance {
  /** AAAA-MM-DD */
  fecha: string;
  /** Vacío = consolidado */
  sucursalId: string;
}

/** Balance general a una fecha, de una sucursal o consolidado (S2-T46). */
export const balanceGeneralQuery = (empresaId: string, f: FiltrosBalance) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "estados", "balance-general", f.fecha, f.sucursalId] as const,
    queryFn: ({ signal }) => {
      const q = new URLSearchParams({ fecha: f.fecha });
      if (f.sucursalId) q.set("sucursalId", f.sucursalId);
      return api<BalanceGeneral>(
        `/empresas/${encodeURIComponent(empresaId)}/estados/balance-general?${q.toString()}`,
        { senal: signal },
      );
    },
  });
