import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { FiltrosBitacoraEntrada, PaginaBitacora } from "@contable/shared";
import { api } from "@/lib/api";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/bitacora`;

/** Cadena de consulta con los filtros que tienen valor, en un orden fijo (para la clave de caché). */
export function consultaBitacora(filtros: FiltrosBitacoraEntrada): string {
  const parametros = new URLSearchParams();
  for (const clave of ["usuarioId", "desde", "hasta", "modulo", "accion", "pagina", "porPagina"] as const) {
    const valor = filtros[clave];
    if (valor !== undefined && valor !== "") parametros.set(clave, String(valor));
  }
  const texto = parametros.toString();
  return texto ? `?${texto}` : "";
}

/** Una página de la bitácora de la empresa con los filtros dados (S1-T58), del cambio más reciente al más antiguo. */
export function pedirBitacora(
  empresaId: string,
  filtros: FiltrosBitacoraEntrada,
  senal?: AbortSignal,
): Promise<PaginaBitacora> {
  return api<PaginaBitacora>(`${ruta(empresaId)}${consultaBitacora(filtros)}`, { senal });
}

export const bitacoraQuery = (empresaId: string, filtros: FiltrosBitacoraEntrada) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "bitacora", consultaBitacora(filtros)] as const,
    queryFn: ({ signal }) => pedirBitacora(empresaId, filtros, signal),
    // Al cambiar de página o de filtro se sigue viendo la página anterior hasta que llega la nueva
    placeholderData: keepPreviousData,
  });
