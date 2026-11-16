import { createContext, useContext } from "react";

export interface SucursalActiva {
  empresaId: string;
  sucursalId: string;
}

export const ContextoSucursalActiva = createContext<SucursalActiva | null>(null);

/** Sucursal seleccionada en el encabezado para que las pantallas la puedan usar. */
export function useSucursalActiva(): SucursalActiva | null {
  return useContext(ContextoSucursalActiva);
}
