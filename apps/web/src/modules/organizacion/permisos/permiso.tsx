import type { ReactNode } from "react";
import type { CodigoPermiso } from "./codigos";
import { usePermiso, type OpcionesPermiso } from "./use-permiso";

interface PermisoProps extends OpcionesPermiso {
  requiere: CodigoPermiso | readonly CodigoPermiso[];
  children: ReactNode;
  /** Lo que se muestra cuando no hay permiso; por defecto, nada */
  alternativa?: ReactNode;
}

/** Muestra su contenido solo si el usuario tiene el permiso: <Permiso requiere="sucursales.gestionar">…</Permiso> */
export function Permiso({ requiere, modo, children, alternativa = null }: PermisoProps) {
  return usePermiso(requiere, { modo }) ? children : alternativa;
}
