import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClaveNota, NotasEstados, VersionNota } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte, type FiltrosReporte } from "../comun/periodo";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/estados/notas`;

/** Notas del período: el texto del ejercicio con las cifras de este período, de una sucursal o consolidado (HU-44). */
export const notasQuery = (empresaId: string, f: FiltrosReporte) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "estados", "notas", f.desde, f.hasta, f.sucursalId] as const,
    queryFn: ({ signal }) =>
      api<NotasEstados>(
        `${base(empresaId)}${consultaReporte({
          desde: f.desde,
          hasta: f.hasta,
          ...(f.sucursalId ? { sucursalId: f.sucursalId } : {}),
        })}`,
        { senal: signal },
      ),
  });

/** Versiones guardadas de una nota del ejercicio que contiene la fecha. */
export const versionesNotaQuery = (empresaId: string, clave: ClaveNota, fecha: string) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "estados", "notas", "versiones", clave, fecha] as const,
    queryFn: ({ signal }) =>
      api<VersionNota[]>(`${base(empresaId)}/${clave}/versiones?fecha=${encodeURIComponent(fecha)}`, {
        senal: signal,
      }),
  });

/** Guarda el texto de una nota como una versión nueva y refresca las notas y su historial. */
export function useGuardarNota(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: { clave: ClaveNota; fecha: string; texto: string }) =>
      api<{ clave: ClaveNota; version: number }>(`${base(empresaId)}/${datos.clave}`, {
        metodo: "PUT",
        cuerpo: { fecha: datos.fecha, texto: datos.texto },
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "estados", "notas"] }),
  });
}
