import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  crearRespaldoSchema,
  restaurarRespaldoSchema,
  type CrearRespaldo,
  type RespaldoVista,
  type ResultadoRestauracionRespaldo,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosRespaldos } from "../../application/casos-respaldos.js";
import {
  EmpresaRespaldoNoEncontradaError,
  EmpresaRespaldoNoVaciaError,
  RespaldoInvalidoError,
  RespaldoNoEncontradoError,
  RespaldoSucursalNoRestaurableError,
  SinPermisoRespaldoError,
  SucursalRespaldoNoAutorizadaError,
  type ArchivoRespaldo,
} from "../../domain/respaldo.js";

function aHttp(error: unknown): never {
  if (error instanceof EmpresaRespaldoNoEncontradaError || error instanceof RespaldoNoEncontradoError) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof SinPermisoRespaldoError || error instanceof SucursalRespaldoNoAutorizadaError) {
    throw new ForbiddenException(error.message);
  }
  if (error instanceof EmpresaRespaldoNoVaciaError) throw new ConflictException(error.message);
  if (error instanceof RespaldoSucursalNoRestaurableError || error instanceof RespaldoInvalidoError) {
    throw new UnprocessableEntityException(error.message);
  }
  throw error;
}

function archivoJson(archivo: ArchivoRespaldo): StreamableFile {
  const contenido = Buffer.from(
    JSON.stringify({ contenido: archivo.contenido, sha256: archivo.sha256 }, null, 2),
    "utf8",
  );
  return new StreamableFile(contenido, {
    type: "application/json; charset=utf-8",
    disposition: `attachment; filename="${archivo.nombreArchivo}"`,
    length: contenido.length,
  });
}

@Controller("empresas/:empresaId/respaldos")
export class RespaldosController {
  constructor(private readonly casos: CasosRespaldos) {}

  @Get()
  @Permiso("respaldo.crear")
  listar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<RespaldoVista[]> {
    return this.casos.listar(usuario.id, empresaId).catch(aHttp);
  }

  @Post()
  @Permiso("respaldo.crear")
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<RespaldoVista> {
    const datos: CrearRespaldo = validar(crearRespaldoSchema, cuerpo);
    return this.casos.crear(usuario.id, empresaId, datos).catch(aHttp);
  }

  @Get(":respaldoId/archivo")
  @Permiso("respaldo.crear")
  async descargar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("respaldoId", ParseUUIDPipe) respaldoId: string,
  ): Promise<StreamableFile> {
    return archivoJson(await this.casos.descargar(usuario.id, empresaId, respaldoId).catch(aHttp));
  }

  @Post(":respaldoId/restaurar")
  @Permiso("respaldo.restaurar")
  restaurar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("respaldoId", ParseUUIDPipe) respaldoId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoRestauracionRespaldo> {
    const datos = validar(restaurarRespaldoSchema, cuerpo);
    return this.casos.restaurar(usuario.id, empresaId, respaldoId, datos).catch(aHttp);
  }
}
