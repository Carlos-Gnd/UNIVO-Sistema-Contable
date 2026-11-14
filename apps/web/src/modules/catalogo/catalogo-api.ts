import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CuentaCatalogo } from "../contabilidad/partidas/tipos";

const rutaCuentas = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/cuentas`;

export const cuentasCatalogoQuery = (empresaId: string) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "cuentas"] as const,
    queryFn: ({ signal }) => api<CuentaCatalogo[]>(rutaCuentas(empresaId), { senal: signal }),
    staleTime: 5 * 60_000,
  });
