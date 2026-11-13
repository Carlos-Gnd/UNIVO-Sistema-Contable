import { Inject, Injectable } from "@nestjs/common";
import type { CrearSucursal, EditarSucursal, SucursalDetalle } from "@contable/shared";
import {
  PERMISO_GESTIONAR_SUCURSALES,
  PERMISO_VER_SUCURSALES,
  ReglaEmpresaError,
  SucursalNoEncontradaError,
} from "../domain/empresa.js";
import { REPOSITORIO_EMPRESAS, type RepositorioEmpresas } from "../domain/repositorio-empresas.js";
import { empresaConPermiso } from "./casos-empresa.js";

/** Sucursales de la empresa (HU-07); quien tiene sucursales asignadas solo ve esas. */
@Injectable()
export class ListarSucursales {
  constructor(@Inject(REPOSITORIO_EMPRESAS) private readonly repositorio: RepositorioEmpresas) {}

  ejecutar(usuarioId: string, empresaId: string): Promise<SucursalDetalle[]> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await empresaConPermiso(unidad, usuarioId, empresaId, PERMISO_VER_SUCURSALES, "ver las sucursales");
      const acceso = await unidad.accesoSucursales(usuarioId, empresaId);
      const sucursales = await unidad.listarSucursales(empresaId);
      return acceso.todas ? sucursales : sucursales.filter((s) => acceso.asignadas.includes(s.id));
    });
  }
}

/** Registrar una sucursal (S1-T43). La casa matriz se crea con la empresa (S1-T44), no por aquí. */
@Injectable()
export class RegistrarSucursal {
  constructor(@Inject(REPOSITORIO_EMPRESAS) private readonly repositorio: RepositorioEmpresas) {}

  ejecutar(usuarioId: string, empresaId: string, datos: CrearSucursal): Promise<SucursalDetalle> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await empresaConPermiso(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_GESTIONAR_SUCURSALES,
        "gestionar sucursales",
      );
      return unidad.crearSucursal(empresaId, datos, false);
    });
  }
}

/**
 * Editar, inactivar o reactivar una sucursal (S1-T43).
 * - La casa matriz no se inactiva: toda empresa conserva al menos una sucursal activa.
 * - Con movimientos, los códigos de Hacienda no cambian (identifican los documentos ya emitidos);
 *   la sucursal se puede inactivar, pero nunca borrar.
 */
@Injectable()
export class EditarSucursalCaso {
  constructor(@Inject(REPOSITORIO_EMPRESAS) private readonly repositorio: RepositorioEmpresas) {}

  ejecutar(
    usuarioId: string,
    empresaId: string,
    sucursalId: string,
    cambios: EditarSucursal,
  ): Promise<SucursalDetalle> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await empresaConPermiso(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_GESTIONAR_SUCURSALES,
        "gestionar sucursales",
      );
      const actual = await unidad.obtenerSucursal(empresaId, sucursalId);
      if (!actual) throw new SucursalNoEncontradaError();

      if (cambios.activa === false && actual.esMatriz) {
        throw new ReglaEmpresaError("La casa matriz no se puede inactivar.");
      }
      const cambiaCodigo =
        (cambios.codigoEstablecimiento !== undefined &&
          cambios.codigoEstablecimiento !== actual.codigoEstablecimiento) ||
        (cambios.codigoPuntoVenta !== undefined && cambios.codigoPuntoVenta !== actual.codigoPuntoVenta);
      if (cambiaCodigo && (await unidad.sucursalTieneMovimientos(sucursalId))) {
        throw new ReglaEmpresaError(
          "La sucursal ya tiene movimientos: sus códigos de Hacienda no se pueden cambiar.",
        );
      }
      return unidad.actualizarSucursal(actual, cambios);
    });
  }
}
