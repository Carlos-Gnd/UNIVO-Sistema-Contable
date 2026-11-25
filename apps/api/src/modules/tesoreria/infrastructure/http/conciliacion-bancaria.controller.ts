import {
  Body,
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  actualizarDetalleConciliacionSchema,
  crearConciliacionBancariaSchema,
  type ConciliacionBancariaVista,
} from "@contable/shared";
import { mensajeDeRegla } from "../../../../compartido/mensaje-regla-db.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosConciliacionBancaria } from "../../application/casos-conciliacion-bancaria.js";
import {
  ConciliacionCuentaNoEncontradaError,
  ConciliacionDuplicadaError,
  ConciliacionEmpresaNoEncontradaError,
  ConciliacionNoEncontradaError,
  ConciliacionSucursalNoAutorizadaError,
  ReglaConciliacionError,
} from "../../domain/conciliacion-bancaria.js";
import { ArchivoEstadoCuentaInvalidoError } from "../../application/estado-cuenta-csv.js";

function aHttp(error: unknown): never {
  if (
    error instanceof ConciliacionEmpresaNoEncontradaError ||
    error instanceof ConciliacionNoEncontradaError ||
    error instanceof ConciliacionCuentaNoEncontradaError
  ) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof ConciliacionSucursalNoAutorizadaError) throw new ForbiddenException(error.message);
  if (error instanceof ConciliacionDuplicadaError) throw new ConflictException(error.message);
  if (error instanceof ReglaConciliacionError) throw new UnprocessableEntityException(error.message);
  if (error instanceof ArchivoEstadoCuentaInvalidoError) throw new BadRequestException(error.message);
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

@Controller("empresas/:empresaId/conciliaciones-bancarias")
export class ConciliacionBancariaController {
  constructor(private readonly casos: CasosConciliacionBancaria) {}

  @Post()
  @Permiso("tesoreria.conciliar")
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ConciliacionBancariaVista> {
    return this.casos
      .crear(usuario.id, empresaId, validar(crearConciliacionBancariaSchema, cuerpo))
      .catch(aHttp);
  }

  @Get(":conciliacionId")
  @Permiso("tesoreria.ver")
  detalle(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("conciliacionId", ParseUUIDPipe) id: string,
  ): Promise<ConciliacionBancariaVista> {
    return this.casos.detalle(usuario.id, empresaId, id).catch(aHttp);
  }

  @Patch(":conciliacionId/marcas")
  @Permiso("tesoreria.conciliar")
  marcar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("conciliacionId", ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ): Promise<ConciliacionBancariaVista> {
    return this.casos
      .marcar(usuario.id, empresaId, id, validar(actualizarDetalleConciliacionSchema, cuerpo))
      .catch(aHttp);
  }

  @Post(":conciliacionId/estado-cuenta/validar")
  @Permiso("tesoreria.conciliar")
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  validarEstadoCuenta(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("conciliacionId", ParseUUIDPipe) id: string,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
  ) {
    if (!archivo) throw new BadRequestException("Selecciona un archivo CSV.");
    return this.casos.estadoCuenta(usuario.id, empresaId, id, archivo.buffer, false).catch(aHttp);
  }

  @Post(":conciliacionId/estado-cuenta/importar")
  @Permiso("tesoreria.conciliar")
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  importarEstadoCuenta(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("conciliacionId", ParseUUIDPipe) id: string,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
  ) {
    if (!archivo) throw new BadRequestException("Selecciona un archivo CSV.");
    return this.casos.estadoCuenta(usuario.id, empresaId, id, archivo.buffer, true).catch(aHttp);
  }
}
