import {
  EmpresaNoEncontradaError,
  PeriodoFueraDeEjercicioError,
  SinPermisoReportesError,
  SucursalNoAutorizadaError,
  type RangoEjercicio,
} from "../domain/balanza.js";
import type { UnidadBalanza } from "../domain/repositorio-balanza.js";

/** Lo que un reporte puede leer: las sucursales (null = todas) y el ejercicio del período. */
export interface AlcanceReporte {
  sucursales: readonly string[] | null;
  ejercicio: RangoEjercicio;
}

/**
 * Validaciones comunes de los reportes (balanzas y estados financieros): el usuario pertenece a la empresa y
 * tiene el permiso; la sucursal pedida existe y la puede ver; y el período está dentro de un mismo ejercicio.
 * Sin sucursal el reporte es consolidado, pero quien está limitado a algunas sucursales solo suma las suyas.
 */
export async function alcanceDelReporte(
  unidad: UnidadBalanza,
  usuarioId: string,
  empresaId: string,
  permiso: { codigo: string; error: () => Error },
  consulta: { desde: string; hasta: string; sucursalId?: string | undefined },
): Promise<AlcanceReporte> {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new EmpresaNoEncontradaError();
  if (!acceso.permisos.has(permiso.codigo)) throw permiso.error();

  let sucursales: readonly string[] | null = acceso.todasSucursales ? null : acceso.sucursales;
  if (consulta.sucursalId) {
    const permitida = acceso.todasSucursales || acceso.sucursales.includes(consulta.sucursalId);
    if (!permitida || !(await unidad.existeSucursal(empresaId, consulta.sucursalId))) {
      throw new SucursalNoAutorizadaError();
    }
    sucursales = [consulta.sucursalId];
  }

  const ejercicio = await unidad.ejercicioDe(empresaId, consulta.desde);
  if (!ejercicio) {
    throw new PeriodoFueraDeEjercicioError(`No hay un ejercicio que contenga el ${consulta.desde}.`);
  }
  if (consulta.hasta > ejercicio.fin) {
    throw new PeriodoFueraDeEjercicioError(
      `El período debe estar dentro de un mismo ejercicio, que termina el ${ejercicio.fin}.`,
    );
  }
  return { sucursales, ejercicio };
}

/** Permiso de las balanzas y los libros. */
export const PERMISO_REPORTES = {
  codigo: "reportes.ver",
  error: () => new SinPermisoReportesError(),
};
