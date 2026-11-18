import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from "@nestjs/common";
import { consultaLibroMayorSchema, type LibroMayor } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarLibroMayor } from "../../application/consultar-libro-mayor.js";
import {
  CuentaLibroMayorNoEncontradaError,
  EmpresaNoEncontradaLibroMayorError,
  SinPermisoLibroMayorError,
  SucursalNoAutorizadaLibroMayorError,
} from "../../domain/libro-mayor.js";

@Controller("empresas/:empresaId/cuentas/:cuentaId/libro-mayor")
export class LibroMayorController {
  constructor(private readonly consultar: ConsultarLibroMayor) {}

  @Get()
  @Permiso("reportes.ver")
  async libroMayor(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("cuentaId", ParseUUIDPipe) cuentaId: string,
    @Query() query: unknown,
  ): Promise<LibroMayor> {
    const filtros = validar(consultaLibroMayorSchema, query);
    try {
      return await this.consultar.ejecutar(usuario.id, empresaId, cuentaId, filtros);
    } catch (error) {
      if (
        error instanceof EmpresaNoEncontradaLibroMayorError ||
        error instanceof CuentaLibroMayorNoEncontradaError
      ) {
        throw new NotFoundException(error.message);
      }
      if (
        error instanceof SinPermisoLibroMayorError ||
        error instanceof SucursalNoAutorizadaLibroMayorError
      ) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }
}
