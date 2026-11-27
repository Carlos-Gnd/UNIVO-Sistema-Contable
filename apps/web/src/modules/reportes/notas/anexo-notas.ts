import { useQuery } from "@tanstack/react-query";
import { errorDeFiltros, type FiltrosReporte } from "../comun/periodo";
import type { DocumentoEstado } from "../exportacion/documento-estado";
import { documentoNotas } from "./documento-notas";
import { notasQuery } from "./notas-api";

/**
 * Las notas a los estados del período del estado que se está viendo, listas para exportarlas junto con él
 * (HU-44). Es undefined mientras cargan o si no se pueden consultar: el estado se exporta igual, sin notas.
 */
export function useAnexoNotas(
  empresaId: string,
  filtros: FiltrosReporte,
  activo = true,
): DocumentoEstado | undefined {
  const notas = useQuery({ ...notasQuery(empresaId, filtros), enabled: activo && !errorDeFiltros(filtros) });
  return notas.data ? documentoNotas(notas.data) : undefined;
}
