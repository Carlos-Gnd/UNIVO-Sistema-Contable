import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from "@nestjs/common";
import { filtrosBitacoraSchema, type PaginaBitacora } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarBitacora } from "../../application/consultar-bitacora.js";
import { EmpresaNoEncontradaError, SinPermisoBitacoraError } from "../../domain/bitacora.js";

@Controller("empresas/:empresaId/bitacora")
export class BitacoraController {
  constructor(private readonly consultar: ConsultarBitacora) {}

  /**
   * Bitácora de la empresa (HU-11, S1-T58), del cambio más reciente al más antiguo.
   * Filtros en la query: usuarioId, desde, hasta (AAAA-MM-DD), modulo, accion, pagina y porPagina.
   */
  @Get()
  async lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<PaginaBitacora> {
    const filtros = validar(filtrosBitacoraSchema, query);
    try {
      return await this.consultar.ejecutar(usuario.id, empresaId, filtros);
    } catch (e) {
      if (e instanceof EmpresaNoEncontradaError) throw new NotFoundException(e.message);
      if (e instanceof SinPermisoBitacoraError) throw new ForbiddenException(e.message);
      throw e;
    }
  }
}
