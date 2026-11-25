import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UnprocessableEntityException,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import {
  MAXIMO_BYTES_IMPORTACION,
  type ReporteImportacionProductos,
  type ResultadoImportacionProductos,
} from "@contable/shared";
import { LIMITE_PESADO } from "../../../../compartido/limite-peticiones.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { ArchivoInvalidoError } from "../../../importacion/domain/plantillas.js";
import { ImportarProductos } from "../../application/importar-productos.js";
import { CodigoProductoDuplicadoError, ReglaProductoError } from "../../domain/producto.js";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function aHttp(e: unknown): never {
  if (e instanceof ArchivoInvalidoError) throw new BadRequestException(e.message);
  if (e instanceof CodigoProductoDuplicadoError) throw new ConflictException(e.message);
  if (e instanceof ReglaProductoError) throw new UnprocessableEntityException(e.message);
  throw e;
}

const exigirArchivo = (archivo: { buffer: Buffer } | undefined): Buffer => {
  if (!archivo) throw new BadRequestException("Adjunte el archivo de Excel en el campo «archivo».");
  return archivo.buffer;
};

/** Importación de productos desde Excel (HU-64). Requiere inventario.registrar. */
@Controller("empresas/:empresaId/productos/importacion")
export class ImportarProductosController {
  constructor(private readonly importacion: ImportarProductos) {}

  @Get("plantilla")
  @Permiso("inventario.registrar")
  async plantilla(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<StreamableFile> {
    const archivo = await this.importacion.plantilla(usuario.id, empresaId).catch(aHttp);
    return new StreamableFile(archivo.contenido, {
      type: TIPO_XLSX,
      disposition: `attachment; filename="${archivo.nombre}"`,
      length: archivo.contenido.length,
    });
  }

  /** Devuelve el reporte por fila sin guardar nada; responde 200 aunque tenga errores. */
  @Post("validar")
  @Permiso("inventario.registrar")
  @Throttle(LIMITE_PESADO)
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: MAXIMO_BYTES_IMPORTACION, files: 1 } }))
  validar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
  ): Promise<ReporteImportacionProductos> {
    return this.importacion.validar(usuario.id, empresaId, exigirArchivo(archivo)).catch(aHttp);
  }

  /** Crea todos los productos si el archivo no tiene errores; si los tiene, no crea ninguno. */
  @Post("cargar")
  @Permiso("inventario.registrar")
  @Throttle(LIMITE_PESADO)
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: MAXIMO_BYTES_IMPORTACION, files: 1 } }))
  cargar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
  ): Promise<ResultadoImportacionProductos> {
    return this.importacion.cargar(usuario.id, empresaId, exigirArchivo(archivo)).catch(aHttp);
  }
}
