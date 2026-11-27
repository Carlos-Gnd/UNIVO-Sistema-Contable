import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
  StreamableFile,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { firmarEstadoSchema, type EstadoFirmadoVista } from "@contable/shared";
import { LIMITE_PESADO } from "../../../../compartido/limite-peticiones.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosFirma } from "../../application/casos-firma.js";
import { FirmaSinSecretoError } from "../../domain/certificados.js";
import { EstadoFirmadoNoEncontradoError } from "../../domain/repositorio-firma.js";

function aHttpFirma(e: unknown): never {
  if (e instanceof EstadoFirmadoNoEncontradoError) throw new NotFoundException(e.message);
  if (e instanceof FirmaSinSecretoError) throw new ServiceUnavailableException(e.message);
  throw e;
}

const archivoPdf = (estado: { pdf: Uint8Array; nombre: string }, disposicion: "attachment" | "inline") =>
  new StreamableFile(Buffer.from(estado.pdf), {
    type: "application/pdf",
    disposition: `${disposicion}; filename="${estado.nombre}"`,
    length: estado.pdf.length,
  });

/** Firma digital de estados financieros (HU-87): firmar, listar y volver a descargar los PDF firmados. */
@Controller("empresas/:empresaId/estados-firmados")
export class EstadosFirmadosController {
  constructor(private readonly casos: CasosFirma) {}

  /**
   * Recibe el estado como lo exporta la web (título, período, columnas y filas), lo firma y devuelve la firma con su
   * código de verificación; el PDF firmado se descarga con GET :id/pdf.
   */
  @Post()
  @Permiso("estados.firmar")
  @Throttle(LIMITE_PESADO)
  async firmar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<EstadoFirmadoVista> {
    const r = await this.casos
      .firmar(usuario.id, empresaId, validar(firmarEstadoSchema, cuerpo))
      .catch(aHttpFirma);
    return r.vista;
  }

  @Get()
  @Permiso("estados.ver")
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<EstadoFirmadoVista[]> {
    return this.casos.listar(usuario.id, empresaId).catch(aHttpFirma);
  }

  @Get(":id/pdf")
  @Permiso("estados.ver")
  async pdf(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return archivoPdf(await this.casos.descargar(usuario.id, empresaId, id).catch(aHttpFirma), "attachment");
  }
}
