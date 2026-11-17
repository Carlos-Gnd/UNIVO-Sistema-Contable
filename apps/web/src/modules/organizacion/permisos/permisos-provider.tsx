import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { esCodigoPermiso, type CodigoPermiso, type PermisosUsuario, type Rol } from "./codigos";
import { PermisosContext, type ValorPermisos } from "./contexto";
import { permisosQuery } from "./permisos-api";

const SIN_PERMISOS: ReadonlySet<CodigoPermiso> = new Set();

function aValor(datos: PermisosUsuario): Omit<ValorPermisos, "estado"> {
  return {
    rol: datos.rol,
    // Un permiso que la interfaz no conoce se descarta en vez de romper la pantalla
    permisos: new Set(datos.permisos.filter(esCodigoPermiso)),
    todasSucursales: datos.todasSucursales,
    sucursales: datos.sucursales,
  };
}

/**
 * Carga los permisos del usuario en la empresa activa y los comparte con usePermiso y <Permiso>.
 * Mientras cargan, o si la consulta falla, no concede ninguno: la interfaz oculta las opciones en vez de
 * mostrarlas de más. La API vuelve a validar cada acción con su guard (S1-T54); esto solo es interfaz.
 */
export function PermisosProvider({ empresaId, children }: { empresaId: string; children: ReactNode }) {
  const { data, status } = useQuery(permisosQuery(empresaId));

  const valor = useMemo<ValorPermisos>(() => {
    if (status === "success") return { estado: "listo", ...aValor(data) };
    return {
      estado: status === "error" ? "error" : "cargando",
      rol: null,
      permisos: SIN_PERMISOS,
      todasSucursales: false,
      sucursales: [],
    };
  }, [data, status]);

  return <PermisosContext value={valor}>{children}</PermisosContext>;
}

/** Proveedor con permisos fijos, para pruebas y para pantallas que ya conocen el rol. */
export function PermisosFijos({
  permisos,
  rol = null,
  todasSucursales = true,
  sucursales = [],
  children,
}: {
  permisos: readonly CodigoPermiso[];
  rol?: Rol | null;
  todasSucursales?: boolean;
  sucursales?: readonly string[];
  children: ReactNode;
}) {
  const valor = useMemo<ValorPermisos>(
    () => ({ estado: "listo", rol, permisos: new Set(permisos), todasSucursales, sucursales }),
    [permisos, rol, todasSucursales, sucursales],
  );
  return <PermisosContext value={valor}>{children}</PermisosContext>;
}
