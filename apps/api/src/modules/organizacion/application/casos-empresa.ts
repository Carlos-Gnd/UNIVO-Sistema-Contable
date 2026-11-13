import { Inject, Injectable } from "@nestjs/common";
import {
  MENSAJE_SOCIEDAD_CON_DUI,
  nitAdmitidoPara,
  type CrearEmpresa,
  type EditarEmpresa,
  type EmpresaDetalle,
} from "@contable/shared";
import {
  EmpresaNoEncontradaError,
  PERMISO_CONFIGURAR_EMPRESA,
  PERMISO_VER_EMPRESA,
  ReglaEmpresaError,
  SinPermisoError,
} from "../domain/empresa.js";
import {
  REPOSITORIO_EMPRESAS,
  type RepositorioEmpresas,
  type UnidadEmpresas,
  type UsuarioSesion,
} from "../domain/repositorio-empresas.js";

/** Verifica que el usuario pertenezca a la empresa y tenga el permiso; devuelve la empresa. */
async function empresaConPermiso(
  unidad: UnidadEmpresas,
  usuarioId: string,
  empresaId: string,
  permiso: string,
  accion: string,
): Promise<EmpresaDetalle> {
  const permisos = await unidad.permisos(usuarioId, empresaId);
  if (!permisos) throw new EmpresaNoEncontradaError();
  if (!permisos.has(permiso)) throw new SinPermisoError(accion);
  const empresa = await unidad.obtener(empresaId);
  if (!empresa) throw new EmpresaNoEncontradaError();
  return empresa;
}

/**
 * Registrar una empresa (HU-06, S1-T38) y dejar a quien la crea como su administrador (S1-T39).
 * Las dos cosas ocurren en la misma transacción: nunca queda una empresa sin administrador.
 */
@Injectable()
export class RegistrarEmpresa {
  constructor(@Inject(REPOSITORIO_EMPRESAS) private readonly repositorio: RepositorioEmpresas) {}

  ejecutar(usuario: UsuarioSesion, datos: CrearEmpresa): Promise<EmpresaDetalle> {
    return this.repositorio.enTransaccion(usuario.id, async (unidad) => {
      await unidad.asegurarUsuario(usuario);
      const empresa = await unidad.crear(datos);
      await unidad.asignarAdministrador(usuario.id, empresa.id);
      return empresa;
    });
  }
}

/** Consultar los datos de una empresa a la que el usuario pertenece. */
@Injectable()
export class ConsultarEmpresa {
  constructor(@Inject(REPOSITORIO_EMPRESAS) private readonly repositorio: RepositorioEmpresas) {}

  ejecutar(usuarioId: string, empresaId: string): Promise<EmpresaDetalle> {
    return this.repositorio.enTransaccion(usuarioId, (unidad) =>
      empresaConPermiso(unidad, usuarioId, empresaId, PERMISO_VER_EMPRESA, "ver la empresa"),
    );
  }
}

/** Editar los datos de una empresa (HU-06, S1-T38); requiere el permiso empresa.configurar. */
@Injectable()
export class EditarEmpresaCaso {
  constructor(@Inject(REPOSITORIO_EMPRESAS) private readonly repositorio: RepositorioEmpresas) {}

  ejecutar(usuarioId: string, empresaId: string, cambios: EditarEmpresa): Promise<EmpresaDetalle> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const actual = await empresaConPermiso(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_CONFIGURAR_EMPRESA,
        "editar los datos",
      );

      if (cambios.nit && !nitAdmitidoPara(actual.tipoContribuyente, cambios.nit)) {
        throw new ReglaEmpresaError(MENSAJE_SOCIEDAD_CON_DUI);
      }
      // Con partidas numeradas, cambiar el modo mezclaría correlativos de dos ámbitos distintos
      if (
        cambios.modoNumeracion &&
        cambios.modoNumeracion !== actual.modoNumeracion &&
        (await unidad.tienePartidasContabilizadas(empresaId))
      ) {
        throw new ReglaEmpresaError(
          "La numeración de partidas no se puede cambiar porque la empresa ya tiene partidas contabilizadas.",
        );
      }
      return unidad.actualizar(empresaId, cambios);
    });
  }
}
