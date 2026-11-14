import { Inject, Injectable } from "@nestjs/common";
import { EmpresaNoEncontradaError } from "../domain/empresa.js";
import {
  REPOSITORIO_EMPRESAS,
  type PermisosUsuarioEmpresa,
  type RepositorioEmpresas,
} from "../domain/repositorio-empresas.js";

/** Devuelve el acceso efectivo del usuario autenticado a una empresa. */
@Injectable()
export class ConsultarMisPermisos {
  constructor(@Inject(REPOSITORIO_EMPRESAS) private readonly repositorio: RepositorioEmpresas) {}

  ejecutar(usuarioId: string, empresaId: string): Promise<PermisosUsuarioEmpresa> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await unidad.permisosUsuario(usuarioId, empresaId);
      if (!acceso) throw new EmpresaNoEncontradaError();
      return acceso;
    });
  }
}
