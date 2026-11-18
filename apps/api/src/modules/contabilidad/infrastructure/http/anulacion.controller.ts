import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnprocessableEntityException,
} from "@nestjs/common";
import { anularPartidaSchema, type ResultadoAnulacion } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { AnularPartida } from "../../application/anular-partida.js";
import {
  FechaReversionInvalidaError,
  MotivoAnulacionRequeridoError,
  PERMISO_ANULAR_PARTIDAS,
  PartidaNoAnulableError,
} from "../../domain/anulacion.js";
import { ReglaContableError } from "../../domain/contabilizacion.js";
import {
  EmpresaNoEncontradaError,
  PartidaNoEncontradaError,
  SinPermisoPartidasError,
} from "../../domain/partida-borrador.js";

/** Traduce los errores de la anulación a respuestas HTTP. */
function aHttp(e: unknown): never {
  if (e instanceof EmpresaNoEncontradaError || e instanceof PartidaNoEncontradaError) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof SinPermisoPartidasError) throw new ForbiddenException(e.message);
  if (e instanceof MotivoAnulacionRequeridoError) throw new BadRequestException(e.message);
  // La partida no está en un estado que se pueda anular (borrador, ya anulada o reversión)
  if (e instanceof PartidaNoAnulableError) throw new ConflictException(e.message);
  // Fecha anterior a la de la partida o período de la reversión cerrado
  if (e instanceof FechaReversionInvalidaError || e instanceof ReglaContableError) {
    throw new UnprocessableEntityException(e.message);
  }
  throw e;
}

@Controller("empresas/:empresaId/partidas")
export class AnulacionController {
  constructor(private readonly anularPartida: AnularPartida) {}

  /**
   * Anula una partida contabilizada con una partida de reversión (HU-24, S2-T12). El motivo es obligatorio
   * y la fecha de la reversión, opcional (hoy por defecto). Requiere partidas.anular (contador o
   * administrador); el auxiliar y el de consulta reciben 403.
   */
  @Post(":partidaId/anular")
  @HttpCode(200)
  @Permiso(PERMISO_ANULAR_PARTIDAS)
  anular(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("partidaId", ParseUUIDPipe) partidaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoAnulacion> {
    const datos = validar(anularPartidaSchema, cuerpo);
    return this.anularPartida.ejecutar(usuario.id, empresaId, partidaId, datos).catch(aHttp);
  }
}
