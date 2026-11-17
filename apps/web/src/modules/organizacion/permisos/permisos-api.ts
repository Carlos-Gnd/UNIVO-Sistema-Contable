import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PermisosUsuario } from "./codigos";

export const rutaPermisos = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/mis-permisos`;

/** Consulta de los permisos del usuario en la empresa activa; se guarda por empresa. */
export const permisosQuery = (empresaId: string) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "mis-permisos"] as const,
    queryFn: ({ signal }) => api<PermisosUsuario>(rutaPermisos(empresaId), { senal: signal }),
    // Los permisos cambian solo cuando el administrador reasigna el rol: no hace falta pedirlos seguido
    staleTime: 5 * 60_000,
  });
