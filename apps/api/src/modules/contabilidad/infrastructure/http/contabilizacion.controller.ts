import {
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  contabilizarLoteSchema,
  type PartidaContabilizada,
  type ResultadoContabilizacion,
} from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ContabilizarPartidas } from "../../application/contabilizar-partidas.js";
import { SinPermisoError } from "../../domain/contabilizacion.js";

@Controller("empresas/:empresaId/partidas")
export class ContabilizacionController {
  constructor(private readonly contabilizarPartidas: ContabilizarPartidas) {}

  /** Contabiliza una partida en borrador (S1-T84). */
  @Post(":partidaId/contabilizar")
  @HttpCode(200)
  async contabilizarUna(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("partidaId", ParseUUIDPipe) partidaId: string,
  ): Promise<PartidaContabilizada> {
    const { contabilizadas, rechazadas } = await this.ejecutar(usuario, empresaId, [partidaId]);
    const [contabilizada] = contabilizadas;
    if (contabilizada) return contabilizada;

    const [rechazo] = rechazadas;
    if (rechazo?.motivo === "no_encontrada") throw new NotFoundException(rechazo.mensaje);
    if (rechazo?.motivo === "sucursal_no_autorizada") throw new ForbiddenException(rechazo.mensaje);
    throw new UnprocessableEntityException(rechazo);
  }

  /** Contabiliza varias partidas desde la bandeja de pendientes (S1-T85). */
  @Post("contabilizar")
  @HttpCode(200)
  contabilizarLote(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoContabilizacion> {
    const { ids } = validar(contabilizarLoteSchema, cuerpo);
    return this.ejecutar(usuario, empresaId, ids);
  }

  private async ejecutar(
    usuario: Usuario,
    empresaId: string,
    ids: string[],
  ): Promise<ResultadoContabilizacion> {
    try {
      return await this.contabilizarPartidas.ejecutar(usuario.id, empresaId, ids);
    } catch (e) {
      if (e instanceof SinPermisoError) throw new ForbiddenException(e.message);
      throw e;
    }
  }
}
