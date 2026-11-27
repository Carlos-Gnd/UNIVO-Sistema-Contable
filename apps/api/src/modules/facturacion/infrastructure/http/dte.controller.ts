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
  UnprocessableEntityException,
} from "@nestjs/common";
import { consultaDteSchema, emitirVentaDteSchema, type DteResumen, type DteVista } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { aHttpDocumento } from "../../../comercial/infrastructure/http/errores-http.js";
import { FirmaSinSecretoError } from "../../../firma/domain/certificados.js";
import { CasosDte } from "../../application/casos-dte.js";
import { DteNoEncontradoError, ReglaDteError } from "../../domain/dte.js";
import { DteInvalidoError } from "../../domain/esquemas-dte.js";

/** Traduce los errores de la facturación electrónica (y los de ventas, notas y kardex que reutiliza) a HTTP. */
export function aHttpDte(e: unknown): never {
  if (e instanceof DteNoEncontradoError) throw new NotFoundException(e.message);
  if (e instanceof ReglaDteError || e instanceof DteInvalidoError) {
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

  @Get(":dteId")
  @Permiso("dte.ver")
  uno(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("dteId", ParseUUIDPipe) dteId: string,
  ): Promise<DteVista> {
    return this.casos.ver(usuario.id, empresaId, dteId).catch(aHttpDte);
  }
}
