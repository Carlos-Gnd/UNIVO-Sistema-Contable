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
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import { periodoLiquidacionIvaSchema, type LiquidacionIvaVista } from "@contable/shared";
import { mensajeDeRegla } from "../../../../compartido/mensaje-regla-db.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosLiquidacionIva } from "../../application/casos-liquidacion-iva.js";
import {
  AlcanceLiquidacionIvaIncompletoError,
  ConflictoLiquidacionIvaError,
  EmpresaLiquidacionIvaNoEncontradaError,
  LiquidacionIvaNoEncontradaError,
  ReglaLiquidacionIvaError,
  SinPermisoLiquidacionIvaError,
} from "../../domain/liquidacion-iva.js";

function aHttp(error: unknown): never {
  if (
    error instanceof EmpresaLiquidacionIvaNoEncontradaError ||
    error instanceof LiquidacionIvaNoEncontradaError
  ) {
    throw new NotFoundException(error.message);
  }
  if (
    error instanceof SinPermisoLiquidacionIvaError ||
    error instanceof AlcanceLiquidacionIvaIncompletoError
  ) {
    throw new ForbiddenException(error.message);
  }
  if (error instanceof ConflictoLiquidacionIvaError) throw new ConflictException(error.message);
  if (error instanceof ReglaLiquidacionIvaError) throw new UnprocessableEntityException(error.message);
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

/** Liquidación mensual del IVA (F-07), HU-48. */
@Controller("empresas/:empresaId/liquidacion-iva")
export class LiquidacionIvaController {
  constructor(private readonly casos: CasosLiquidacionIva) {}

  @Get()
  @Permiso("declaraciones.ver")
  consultar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: unknown,
  ): Promise<LiquidacionIvaVista> {
    const { anio, mes } = validar(periodoLiquidacionIvaSchema, consulta);
    return this.casos.consultar(usuario.id, empresaId, anio, mes).catch(aHttp);
  }

  @Post("partida")
  @Permiso("declaraciones.generar")
  generarPartida(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<LiquidacionIvaVista> {
    const { anio, mes } = validar(periodoLiquidacionIvaSchema, cuerpo);
    return this.casos.generarPartida(usuario.id, empresaId, anio, mes).catch(aHttp);
  }

  @Post("presentar")
  @Permiso("declaraciones.generar")
  presentar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<LiquidacionIvaVista> {
    const { anio, mes } = validar(periodoLiquidacionIvaSchema, cuerpo);
    return this.casos.presentar(usuario.id, empresaId, anio, mes).catch(aHttp);
  }
}
