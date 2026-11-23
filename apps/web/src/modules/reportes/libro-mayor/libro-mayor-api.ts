import { queryOptions } from "@tanstack/react-query";
import type { LibroMayor } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte, type FiltrosReporte } from "../comun/periodo";

/** Libro mayor de una cuenta con su saldo acumulado (S2-T21). Una cuenta de mayor incluye sus subcuentas. */
export const libroMayorQuery = (empresaId: string, cuentaId: string, f: FiltrosReporte) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "libro-mayor", cuentaId, f.desde, f.hasta, f.sucursalId] as const,
    queryFn: ({ signal }) =>
      api<LibroMayor>(
        `/empresas/${encodeURIComponent(empresaId)}/cuentas/${encodeURIComponent(cuentaId)}/libro-mayor${consultaReporte(
          { desde: f.desde, hasta: f.hasta, ...(f.sucursalId ? { sucursalId: f.sucursalId } : {}) },
        )}`,
        { senal: signal },
      ),
  });
