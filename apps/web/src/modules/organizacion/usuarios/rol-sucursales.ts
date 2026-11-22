import type { RolEmpresa } from "@contable/shared";

export const ROLES: readonly RolEmpresa[] = ["administrador", "contador", "auxiliar", "consulta"];

/** Administrador y contador trabajan con todas las sucursales; auxiliar y consulta, solo con las asignadas. */
export const rolUsaSucursales = (rol: RolEmpresa) => rol === "auxiliar" || rol === "consulta";

export interface ValoresRol {
  rol: RolEmpresa;
  sucursales: string[];
}

/** Lo que se envía a la API: las sucursales solo cuando el rol las usa. */
export const datosRol = ({ rol, sucursales }: ValoresRol): ValoresRol => ({
  rol,
  sucursales: rolUsaSucursales(rol) ? sucursales : [],
});
