import {
  BadRequestException,
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
  Body,
} from "@nestjs/common";
import { crearConfiguracionIsrSchema } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { mensajeDeRegla } from "../../../../compartido/mensaje-regla-db.js";
import { CasosCierreAnual } from "../../application/casos-cierre-anual.js";
import {
  AlcanceCierreAnualIncompletoError,
  ConfiguracionIsrNoEncontradaError,
  ConflictoCierreAnualError,
  EmpresaCierreAnualNoEncontradaError,
  EjercicioCierreAnualNoEncontradoError,
  EjercicioSiguienteNoEncontradoError,
  ReglaCierreAnualError,
  SinPermisoCierreAnualError,
} from "../../domain/cierre-anual.js";

function aHttp(error: unknown): never {
  if (
    error instanceof EmpresaCierreAnualNoEncontradaError ||
    error instanceof EjercicioCierreAnualNoEncontradoError ||
    error instanceof EjercicioSiguienteNoEncontradoError ||
    error instanceof ConfiguracionIsrNoEncontradaError
  ) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof SinPermisoCierreAnualError || error instanceof AlcanceCierreAnualIncompletoError) {
    throw new ForbiddenException(error.message);
  }
  if (error instanceof ConflictoCierreAnualError) throw new ConflictException(error.message);
  if (error instanceof ReglaCierreAnualError) throw new UnprocessableEntityException(error.message);
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

@Controller("empresas/:empresaId/cierre-anual")
export class CierreAnualController {
  constructor(private readonly casos: CasosCierreAnual) {}

  @Get()
  @Permiso("declaraciones.ver")
  estado(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query("anio", ParseIntPipe) anio: number,
  ) {
    if (anio < 2000 || anio > 2100) throw new BadRequestException("El año debe estar entre 2000 y 2100.");
    return this.casos.estado(usuario.id, empresaId, anio).catch(aHttp);
  }

  @Post("configuracion-isr")
  @Permiso("declaraciones.generar")
  configurar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ) {
    return this.casos
      .crearConfiguracion(usuario.id, empresaId, validar(crearConfiguracionIsrSchema, cuerpo))
      .catch(aHttp);
  }

  @Post("ejercicios/:anio/impuesto-renta")
  @Permiso("declaraciones.generar")
  calcular(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("anio", ParseIntPipe) anio: number,
  ) {
    if (anio < 2000 || anio > 2100) throw new BadRequestException("El año debe estar entre 2000 y 2100.");
    return this.casos.calcularYProvisionar(usuario.id, empresaId, anio).catch(aHttp);
  }

  @Post("ejercicios/:anio/cerrar-noviembre")
  @Permiso("periodos.cerrar")
  cerrarNoviembre(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("anio", ParseIntPipe) anio: number,
  ) {
    if (anio < 2000 || anio > 2100) throw new BadRequestException("El año debe estar entre 2000 y 2100.");
    return this.casos.cerrarNoviembre(usuario.id, empresaId, anio).catch(aHttp);
  }

  @Post("ejercicios/:anio/partida-cierre")
  @Permiso("periodos.cerrar")
  crearPartidaCierre(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("anio", ParseIntPipe) anio: number,
  ) {
    if (anio < 2000 || anio > 2100) throw new BadRequestException("El año debe estar entre 2000 y 2100.");
    return this.casos.crearPartidaCierre(usuario.id, empresaId, anio).catch(aHttp);
  }

  @Post("ejercicios/:anio/confirmar-cierre")
  @Permiso("periodos.cerrar")
  confirmarCierre(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("anio", ParseIntPipe) anio: number,
  ) {
    if (anio < 2000 || anio > 2100) throw new BadRequestException("El año debe estar entre 2000 y 2100.");
    return this.casos.confirmarCierre(usuario.id, empresaId, anio).catch(aHttp);
  }

  @Post("ejercicios/:anio/reapertura")
  @Permiso("partidas.registrar")
  crearPartidaReapertura(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("anio", ParseIntPipe) anio: number,
  ) {
    if (anio < 2000 || anio > 2100) throw new BadRequestException("El año debe estar entre 2000 y 2100.");
    return this.casos.crearPartidaReapertura(usuario.id, empresaId, anio).catch(aHttp);
  }
}
