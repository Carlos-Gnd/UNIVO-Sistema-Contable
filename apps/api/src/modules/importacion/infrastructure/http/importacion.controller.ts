import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  MAXIMO_BYTES_IMPORTACION,
  generarPartidaAperturaSchema,
  tipoImportacionSchema,
  type GenerarPartidaApertura,
  type ReporteImportacion,
  type TipoImportacion,
} from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { validar } from "../../../../compartido/validacion.js";
import { ImportacionExcel } from "../../application/importacion-excel.js";
import { ReglaContableError } from "../../../contabilidad/domain/contabilizacion.js";
import {
  EmpresaNoEncontradaError as EmpresaPartidasNoEncontradaError,
  LineasInvalidasError,
  SinPermisoPartidasError,
  SucursalNoAutorizadaError,
} from "../../../contabilidad/domain/partida-borrador.js";
import {
  ArchivoInvalidoError,
  EmpresaNoEncontradaError,
  SinPermisoImportarError,
} from "../../domain/plantillas.js";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function tipoValido(tipo: string): TipoImportacion {
  const r = tipoImportacionSchema.safeParse(tipo);
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message);
  return r.data;
}

function aHttp(e: unknown): never {
  if (e instanceof EmpresaNoEncontradaError) throw new NotFoundException(e.message);
  if (e instanceof SinPermisoImportarError) throw new ForbiddenException(e.message);
  if (e instanceof EmpresaPartidasNoEncontradaError) throw new NotFoundException(e.message);
  if (e instanceof SinPermisoPartidasError || e instanceof SucursalNoAutorizadaError) {
    throw new ForbiddenException("No tiene permiso para generar la partida en esta sucursal.");
  }
  if (e instanceof ArchivoInvalidoError) throw new BadRequestException(e.message);
  if (e instanceof LineasInvalidasError) {
    throw new UnprocessableEntityException({ mensaje: e.message, lineas: e.errores });
  }
  if (e instanceof ReglaContableError) throw new UnprocessableEntityException(e.message);
  throw e;
}

/** Importación del catálogo y de los saldos iniciales desde Excel (HU-17). Requiere catalogo.importar. */
@Controller("empresas/:empresaId/importacion/:tipo")
export class ImportacionController {
  constructor(private readonly importacion: ImportacionExcel) {}

  /** Descarga la plantilla: catalogo o saldos-iniciales (S1-T68). */
  @Permiso("catalogo.importar")
  @Get("plantilla")
  async plantilla(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("tipo") tipo: string,
  ): Promise<StreamableFile> {
    const archivo = await this.importacion.plantilla(usuario.id, empresaId, tipoValido(tipo)).catch(aHttp);
    return new StreamableFile(archivo.contenido, {
      type: TIPO_XLSX,
      disposition: `attachment; filename="${archivo.nombre}"`,
      length: archivo.contenido.length,
    });
  }

  /**
   * Lee el Excel del campo «archivo» y devuelve el reporte de errores por fila, sin guardar nada (S1-T69).
   * Responde 200 aunque el archivo tenga errores: el reporte dice si es válido.
   */
  @Post("validar")
  @Permiso("catalogo.importar")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: MAXIMO_BYTES_IMPORTACION, files: 1 } }))
  async validar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("tipo") tipo: string,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
  ): Promise<ReporteImportacion> {
    const tipoImportacion = tipoValido(tipo);
    if (!archivo) throw new BadRequestException("Adjunte el archivo de Excel en el campo «archivo».");
    return this.importacion.validar(usuario.id, empresaId, tipoImportacion, archivo.buffer).catch(aHttp);
  }

  /** Valida los saldos y, si no hay errores, crea la partida de apertura en borrador (S1-T70). */
  @Post("cargar")
  @Permiso("catalogo.importar")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: MAXIMO_BYTES_IMPORTACION, files: 1 } }))
  async cargar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("tipo") tipo: string,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
  ) {
    if (tipoValido(tipo) !== "saldos-iniciales") {
      throw new BadRequestException("La carga solo está disponible para saldos-iniciales.");
    }
    if (!archivo) throw new BadRequestException("Adjunte el archivo de Excel en el campo «archivo».");
    const datos: GenerarPartidaApertura = validar(generarPartidaAperturaSchema, cuerpo);
    return this.importacion.generarPartidaApertura(usuario.id, empresaId, datos, archivo.buffer).catch(aHttp);
  }
}
