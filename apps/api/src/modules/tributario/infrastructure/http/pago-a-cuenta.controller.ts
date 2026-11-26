import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  anioPagoACuentaSchema,
  periodoPagoACuentaSchema,
  type PagoACuentaVista,
  type PagosACuentaEjercicioVista,
} from "@contable/shared";
import { mensajeDeRegla } from "../../../../compartido/mensaje-regla-db.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosPagoACuenta } from "../../application/casos-pago-a-cuenta.js";
import {
  AlcancePagoACuentaIncompletoError,
  ConflictoPagoACuentaError,
  EmpresaPagoACuentaNoEncontradaError,
  PagoACuentaNoEncontradoError,
  ReglaPagoACuentaError,
  SinPermisoPagoACuentaError,
} from "../../domain/pago-a-cuenta.js";

function aHttp(error: unknown): never {
  if (error instanceof EmpresaPagoACuentaNoEncontradaError || error instanceof PagoACuentaNoEncontradoError) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof SinPermisoPagoACuentaError || error instanceof AlcancePagoACuentaIncompletoError) {
    throw new ForbiddenException(error.message);
  }
  if (error instanceof ConflictoPagoACuentaError) throw new ConflictException(error.message);
  if (error instanceof ReglaPagoACuentaError) throw new UnprocessableEntityException(error.message);
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

/** Pago a cuenta del 1.75 % y retenciones de renta del mes (F-14), HU-49. */
@Controller("empresas/:empresaId/pago-a-cuenta")
export class PagoACuentaController {
  constructor(private readonly casos: CasosPagoACuenta) {}

  @Get()
  @Permiso("declaraciones.ver")
  consultar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: unknown,
  ): Promise<PagoACuentaVista> {
    const { anio, mes } = validar(periodoPagoACuentaSchema, consulta);
    return this.casos.consultar(usuario.id, empresaId, anio, mes).catch(aHttp);
  }

  @Get("ejercicios/:anio")
  @Permiso("declaraciones.ver")
  ejercicio(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("anio", ParseIntPipe) anio: number,
  ): Promise<PagosACuentaEjercicioVista> {
    const { anio: valido } = validar(anioPagoACuentaSchema, { anio });
    return this.casos.ejercicio(usuario.id, empresaId, valido).catch(aHttp);
  }

  @Post("partida")
  @Permiso("declaraciones.generar")
  generarPartida(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PagoACuentaVista> {
    const { anio, mes } = validar(periodoPagoACuentaSchema, cuerpo);
    return this.casos.generarPartida(usuario.id, empresaId, anio, mes).catch(aHttp);
  }

  @Post("presentar")
  @Permiso("declaraciones.generar")
  presentar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PagoACuentaVista> {
    const { anio, mes } = validar(periodoPagoACuentaSchema, cuerpo);
    return this.casos.presentar(usuario.id, empresaId, anio, mes).catch(aHttp);
  }
}
