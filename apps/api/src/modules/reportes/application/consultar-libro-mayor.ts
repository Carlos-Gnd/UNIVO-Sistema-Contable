import { Inject, Injectable } from "@nestjs/common";
import type { ConsultaLibroMayor, LibroMayor } from "@contable/shared";
import {
  armarLibroMayor,
  CuentaLibroMayorNoEncontradaError,
  EmpresaNoEncontradaLibroMayorError,
  PERMISO_VER_REPORTES,
  REPOSITORIO_LIBRO_MAYOR,
  SinPermisoLibroMayorError,
  SucursalNoAutorizadaLibroMayorError,
  type RepositorioLibroMayor,
} from "../domain/libro-mayor.js";

@Injectable()
export class ConsultarLibroMayor {
  constructor(@Inject(REPOSITORIO_LIBRO_MAYOR) private readonly repositorio: RepositorioLibroMayor) {}

  ejecutar(
    usuarioId: string,
    empresaId: string,
    cuentaId: string,
    filtros: ConsultaLibroMayor,
  ): Promise<LibroMayor> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await unidad.acceso(usuarioId, empresaId);
      if (!acceso) throw new EmpresaNoEncontradaLibroMayorError();
      if (!acceso.permisos.has(PERMISO_VER_REPORTES)) throw new SinPermisoLibroMayorError();

      let sucursales: readonly string[] | null = acceso.todasSucursales ? null : acceso.sucursales;
      if (filtros.sucursalId) {
        const permitida = acceso.todasSucursales || acceso.sucursales.includes(filtros.sucursalId);
        if (!permitida || !(await unidad.existeSucursal(empresaId, filtros.sucursalId))) {
          throw new SucursalNoAutorizadaLibroMayorError();
        }
        sucursales = [filtros.sucursalId];
      }

      const cuenta = await unidad.cuenta({
        empresaId,
        cuentaId,
        desde: filtros.desde ?? null,
        hasta: filtros.hasta ?? null,
        tipo: filtros.tipo ?? null,
        sucursales,
      });
      if (!cuenta) throw new CuentaLibroMayorNoEncontradaError();
      return armarLibroMayor(cuenta, {
        desde: filtros.desde ?? null,
        hasta: filtros.hasta ?? null,
        tipo: filtros.tipo ?? null,
      });
    });
  }
}
