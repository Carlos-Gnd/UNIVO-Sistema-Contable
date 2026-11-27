import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Contrato de S4-T22. Se mantiene local hasta que esa rama se integre en main. */
export interface RazonesFinancierasVista {
  desde: string;
  hasta: string;
  sucursalId: string | null;
  liquidezCorriente: string | null;
  pruebaAcida: string | null;
  endeudamiento: string | null;
  margenBruto: string | null;
  margenOperativo: string | null;
  margenNeto: string | null;
  rentabilidadActivo: string | null;
  rentabilidadPatrimonio: string | null;
}

export interface FiltrosRazones {
  desde: string;
  hasta: string;
  sucursalId: string;
}

export function razonesFinancierasQuery(empresaId: string, filtros: FiltrosRazones) {
  const consulta = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta });
  if (filtros.sucursalId) consulta.set("sucursalId", filtros.sucursalId);

  return queryOptions({
    queryKey: [
      "empresas",
      empresaId,
      "estados",
      "razones-financieras",
      filtros.desde,
      filtros.hasta,
      filtros.sucursalId,
    ] as const,
    queryFn: ({ signal }) =>
      api<RazonesFinancierasVista>(
        `/empresas/${encodeURIComponent(empresaId)}/estados/razones-financieras?${consulta.toString()}`,
        { senal: signal },
      ),
  });
}
