import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  StreamableFile,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  consultaDteSchema,
  emitirNotaDteSchema,
  emitirVentaDteSchema,
  invalidarDteSchema,
  type DteResumen,
  type DteVista,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { aHttpDocumento } from "../../../comercial/infrastructure/http/errores-http.js";
import { PartidaNoAnulableError } from "../../../contabilidad/domain/anulacion.js";
import { ReglaContableError } from "../../../contabilidad/domain/contabilizacion.js";
import { FirmaSinSecretoError } from "../../../firma/domain/certificados.js";
import { CasosDte } from "../../application/casos-dte.js";
import { DteNoEncontradoError, ReglaDteError } from "../../domain/dte.js";
import { DteInvalidoError } from "../../domain/esquemas-dte.js";

/** Traduce los errores de la facturación electrónica (y los de ventas, notas y kardex que reutiliza) a HTTP. */
export function aHttpDte(e: unknown): never {
  if (e instanceof DteNoEncontradoError) throw new NotFoundException(e.message);
  if (
    e instanceof ReglaDteError ||
    e instanceof DteInvalidoError ||
    e instanceof ReglaContableError ||
    e instanceof PartidaNoAnulableError
  ) {
    throw new UnprocessableEntityException(e.message);
  }
  if (e instanceof FirmaSinSecretoError) throw new ServiceUnavailableException(e.message);
  return aHttpDocumento(e);
}

/**
 * Documentos tributarios electrónicos de una empresa (HU-53 a HU-57), en el ambiente de pruebas de Hacienda:
 * emisión de facturas, CCF y notas, invalidación, consulta, JSON firmado y representación gráfica en PDF.
 */
@Controller("empresas/:empresaId/dte")
export class DteController {
  constructor(private readonly casos: CasosDte) {}

  /** Filtros opcionales: ?desde, ?hasta (AAAA-MM-DD), ?tipo (01, 03, 05, 06), ?estado y ?busqueda. */
  @Get()
  @Permiso("dte.ver")
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: Record<string, unknown>,
  ): Promise<DteResumen[]> {
    return this.casos.listar(usuario.id, empresaId, validar(consultaDteSchema, consulta)).catch(aHttpDte);
  }

  /** Factura (tipoDocumento factura) o CCF (ccf): registra la venta con su partida y emite el DTE. */
  @Post("ventas")
  @Permiso("dte.emitir")
  emitirVenta(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<DteVista> {
    return this.casos
      .emitirVenta(usuario.id, empresaId, validar(emitirVentaDteSchema, cuerpo))
      .catch(aHttpDte);
  }

  /** Nota de crédito o débito sobre una venta con CCF electrónico. */
  @Post("notas")
  @Permiso("dte.emitir")
  emitirNota(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<DteVista> {
    return this.casos.emitirNota(usuario.id, empresaId, validar(emitirNotaDteSchema, cuerpo)).catch(aHttpDte);
  }

  @Get(":dteId")
  @Permiso("dte.ver")
  uno(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("dteId", ParseUUIDPipe) dteId: string,
  ): Promise<DteVista> {
    return this.casos.ver(usuario.id, empresaId, dteId).catch(aHttpDte);
  }

  /** JSON del DTE con su firma electrónica y su sello, como se entrega al cliente junto con el PDF. */
  @Get(":dteId/json")
  @Permiso("dte.ver")
  async json(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("dteId", ParseUUIDPipe) dteId: string,
  ): Promise<StreamableFile> {
    const dte = await this.casos.ver(usuario.id, empresaId, dteId).catch(aHttpDte);
    const contenido = Buffer.from(
      JSON.stringify(
        { ...dte.documento, firmaElectronica: dte.firma, selloRecibido: dte.selloRecepcion },
        null,
        2,
      ),
    );
    return new StreamableFile(contenido, {
      type: "application/json",
      disposition: `attachment; filename="${dte.numeroControl}.json"`,
      length: contenido.length,
    });
  }

  /** Representación gráfica en PDF con el QR de la consulta pública. */
  @Get(":dteId/pdf")
  @Permiso("dte.ver")
  async pdf(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("dteId", ParseUUIDPipe) dteId: string,
  ): Promise<StreamableFile> {
    const archivo = await this.casos.pdf(usuario.id, empresaId, dteId).catch(aHttpDte);
    return new StreamableFile(Buffer.from(archivo.pdf), {
      type: "application/pdf",
      disposition: `inline; filename="${archivo.nombre}"`,
      length: archivo.pdf.length,
    });
  }

  /** Invalida el DTE con su motivo (y, opcional, el tipo de invalidación 1, 2 o 3) y revierte sus partidas. */
  @Post(":dteId/invalidar")
  @Permiso("dte.invalidar")
  invalidar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("dteId", ParseUUIDPipe) dteId: string,
    @Body() cuerpo: unknown,
  ): Promise<DteVista> {
    return this.casos
      .invalidar(usuario.id, empresaId, dteId, validar(invalidarDteSchema, cuerpo))
      .catch(aHttpDte);
  }
}
