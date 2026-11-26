import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import {
  MAXIMO_BYTES_IMPORTACION,
  type ReporteImportacionTerceros,
  type ResultadoImportacionTerceros,
} from "@contable/shared";
import { LIMITE_PESADO } from "../../../../compartido/limite-peticiones.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { ArchivoInvalidoError } from "../../../importacion/domain/plantillas.js";
import { ImportarTerceros } from "../../application/importar-terceros.js";
import { aHttp as aHttpComercial } from "./terceros.controller.js";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function aHttp(e: unknown): never {
  if (e instanceof ArchivoInvalidoError) throw new BadRequestException(e.message);
  return aHttpComercial(e);
}

const exigirArchivo = (archivo: { buffer: Buffer } | undefined): Buffer => {
  if (!archivo) throw new BadRequestException("Adjunte el archivo de Excel en el campo «archivo».");
  return archivo.buffer;
};

/** Importación de clientes y proveedores desde Excel (HU-58). Requiere terceros.registrar. */
@Controller("empresas/:empresaId/terceros/importacion")
export class ImportarTercerosController {
  constructor(private readonly importacion: ImportarTerceros) {}

  @Get("plantilla")
  @Permiso("terceros.registrar")
  async plantilla(): Promise<StreamableFile> {
    const archivo = await this.importacion.plantilla();
    return new StreamableFile(archivo.contenido, {
      type: TIPO_XLSX,
      disposition: `attachment; filename="${archivo.nombre}"`,
      length: archivo.contenido.length,
    });
  }

  /** Devuelve el reporte por fila sin guardar nada; responde 200 aunque tenga errores. */
  @Post("validar")
  @Permiso("terceros.registrar")
  @Throttle(LIMITE_PESADO)
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: MAXIMO_BYTES_IMPORTACION, files: 1 } }))
  validar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
  ): Promise<ReporteImportacionTerceros> {
    return this.importacion.validar(usuario.id, empresaId, exigirArchivo(archivo)).catch(aHttp);
  }

  /** Crea todos los clientes y proveedores si el archivo no tiene errores; si los tiene, no crea ninguno. */
  @Post("cargar")
  @Permiso("terceros.registrar")
  @Throttle(LIMITE_PESADO)
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: MAXIMO_BYTES_IMPORTACION, files: 1 } }))
  cargar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
  ): Promise<ResultadoImportacionTerceros> {
    return this.importacion.cargar(usuario.id, empresaId, exigirArchivo(archivo)).catch(aHttp);
  }
}
