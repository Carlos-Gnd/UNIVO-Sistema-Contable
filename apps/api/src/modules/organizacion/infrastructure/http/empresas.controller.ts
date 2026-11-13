import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnprocessableEntityException,
} from "@nestjs/common";
import { crearEmpresaSchema, editarEmpresaSchema, type EmpresaDetalle } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarEmpresa, EditarEmpresaCaso, RegistrarEmpresa } from "../../application/casos-empresa.js";
import {
  EmpresaNoEncontradaError,
  NitDuplicadoError,
  ReglaEmpresaError,
  SinPermisoError,
} from "../../domain/empresa.js";

/** Traduce los errores del dominio a respuestas HTTP. */
function aHttp(e: unknown): never {
  if (e instanceof EmpresaNoEncontradaError) throw new NotFoundException(e.message);
  if (e instanceof SinPermisoError) throw new ForbiddenException(e.message);
  if (e instanceof NitDuplicadoError) throw new ConflictException(e.message);
  if (e instanceof ReglaEmpresaError) throw new UnprocessableEntityException(e.message);
  throw e;
}

@Controller("empresas")
export class EmpresasController {
  constructor(
    private readonly registrar: RegistrarEmpresa,
    private readonly consultar: ConsultarEmpresa,
    private readonly editar: EditarEmpresaCaso,
  ) {}

  /** Registra una empresa con su catálogo; quien la crea queda como su administrador (S1-T38, S1-T39, S1-T67). */
  @Post()
  crear(@UsuarioActual() usuario: Usuario, @Body() cuerpo: unknown): Promise<EmpresaDetalle> {
    const datos = validar(crearEmpresaSchema, cuerpo);
    return this.registrar.ejecutar(usuario, datos).catch(aHttp);
  }

  @Get(":empresaId")
  obtener(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<EmpresaDetalle> {
    return this.consultar.ejecutar(usuario.id, empresaId).catch(aHttp);
  }

  /** Edita solo los campos enviados (S1-T38). */
  @Patch(":empresaId")
  actualizar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<EmpresaDetalle> {
    const cambios = validar(editarEmpresaSchema, cuerpo);
    return this.editar.ejecutar(usuario.id, empresaId, cambios).catch(aHttp);
  }
}
