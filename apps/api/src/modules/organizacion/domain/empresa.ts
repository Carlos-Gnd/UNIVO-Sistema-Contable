/** Permisos de la matriz de roles que usa la gestión de empresas. */
export const PERMISO_VER_EMPRESA = "empresa.ver";
export const PERMISO_CONFIGURAR_EMPRESA = "empresa.configurar";

/** La empresa no existe o el usuario no pertenece a ella (no se revela cuál de las dos). */
export class EmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}

/** El rol del usuario no tiene el permiso necesario en la empresa. */
export class SinPermisoError extends Error {
  constructor(accion: string) {
    super(`Su rol no permite ${accion} en esta empresa.`);
  }
}

/** Ya hay una empresa registrada con ese NIT (es único en el sistema). */
export class NitDuplicadoError extends Error {
  constructor(nit: string) {
    super(`Ya existe una empresa registrada con el NIT ${nit}.`);
  }
}

/** Una regla de negocio impide el cambio (por ejemplo, cambiar la numeración con partidas contabilizadas). */
export class ReglaEmpresaError extends Error {}
