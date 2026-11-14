import { createContext } from "react";
import type { CodigoPermiso, Rol } from "./codigos";

export type EstadoPermisos = "cargando" | "listo" | "error";

export interface ValorPermisos {
  estado: EstadoPermisos;
  rol: Rol | null;
  /** Permisos concedidos; vacío mientras carga o si falló la consulta (se niega todo por defecto) */
  permisos: ReadonlySet<CodigoPermiso>;
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export const PermisosContext = createContext<ValorPermisos | null>(null);
