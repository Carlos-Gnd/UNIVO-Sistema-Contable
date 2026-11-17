import { useContext } from "react";
import type { CodigoPermiso } from "./codigos";
import { PermisosContext, type ValorPermisos } from "./contexto";

/** Permisos del usuario en la empresa activa. Debe usarse dentro de <PermisosProvider>. */
export function usePermisos(): ValorPermisos {
  const valor = useContext(PermisosContext);
  if (!valor) throw new Error("usePermisos debe usarse dentro de <PermisosProvider>.");
  return valor;
}

export interface OpcionesPermiso {
  /** "todos" (por defecto) exige cada permiso de la lista; "alguno" basta con uno */
  modo?: "todos" | "alguno";
}

export function tienePermiso(
  concedidos: ReadonlySet<CodigoPermiso>,
  requeridos: CodigoPermiso | readonly CodigoPermiso[],
  { modo = "todos" }: OpcionesPermiso = {},
): boolean {
  const lista: readonly CodigoPermiso[] = typeof requeridos === "string" ? [requeridos] : requeridos;
  if (lista.length === 0) return true;
  return modo === "alguno" ? lista.some((p) => concedidos.has(p)) : lista.every((p) => concedidos.has(p));
}

/**
 * true si el usuario tiene el permiso (o los permisos) en la empresa activa (S1-T56).
 *
 *   const puedeContabilizar = usePermiso("partidas.contabilizar");
 *   const puedeVerReportes = usePermiso(["reportes.ver", "estados.ver"], { modo: "alguno" });
 */
export function usePermiso(
  requeridos: CodigoPermiso | readonly CodigoPermiso[],
  opciones?: OpcionesPermiso,
): boolean {
  return tienePermiso(usePermisos().permisos, requeridos, opciones);
}

/** true si el usuario puede trabajar con la sucursal: todas para administrador y contador, las asignadas para los demás. */
export function usePuedeUsarSucursal(sucursalId: string): boolean {
  const { estado, todasSucursales, sucursales } = usePermisos();
  return estado === "listo" && (todasSucursales || sucursales.includes(sucursalId));
}
