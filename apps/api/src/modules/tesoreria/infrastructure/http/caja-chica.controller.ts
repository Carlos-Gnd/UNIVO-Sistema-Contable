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
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  crearCajaChicaSchema,
  crearValeCajaChicaSchema,
  reintegrarCajaChicaSchema,
  type CajaChicaVista,
} from "@contable/shared";
import { mensajeDeRegla } from "../../../../compartido/mensaje-regla-db.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosCajaChica } from "../../application/casos-caja-chica.js";
import {
  CajaChicaDuplicadaError,
  CajaChicaEmpresaNoEncontradaError,
  CajaChicaNoEncontradaError,
  CuentaCajaChicaInvalidaError,
  CuentaGastoCajaChicaInvalidaError,
  ReglaCajaChicaError,
  SinValesPorReintegrarError,
  SucursalCajaChicaNoAutorizadaError,
  SucursalCajaChicaNoEncontradaError,
} from "../../domain/caja-chica.js";

function aHttp(error: unknown): never {
  if (
    error instanceof CajaChicaEmpresaNoEncontradaError ||
    error instanceof CajaChicaNoEncontradaError ||
    error instanceof SucursalCajaChicaNoEncontradaError
  ) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof SucursalCajaChicaNoAutorizadaError) throw new ForbiddenException(error.message);
  if (error instanceof CajaChicaDuplicadaError) throw new ConflictException(error.message);
  if (
    error instanceof CuentaCajaChicaInvalidaError ||
    error instanceof CuentaGastoCajaChicaInvalidaError ||
    error instanceof SinValesPorReintegrarError ||
    error instanceof ReglaCajaChicaError
  ) {
    throw new UnprocessableEntityException(error.message);
  }
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

/** Fondo fijo, vales y reintegros de caja chica (HU-77, S3-T115). */
@Controller("empresas/:empresaId/cajas-chicas")
export class CajaChicaController {
  constructor(private readonly casos: CasosCajaChica) {}

  @Get()
  @Permiso("tesoreria.ver")
  listar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<CajaChicaVista[]> {
    return this.casos.listar(usuario.id, empresaId).catch(aHttp);
  }

  @Post()
  @Permiso("tesoreria.registrar")
  abrir(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<CajaChicaVista> {
    return this.casos.abrir(usuario.id, empresaId, validar(crearCajaChicaSchema, cuerpo)).catch(aHttp);
  }

  @Post(":cajaChicaId/vales")
  @Permiso("tesoreria.registrar")
  registrarVale(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("cajaChicaId", ParseUUIDPipe) cajaChicaId: string,
    @Body() cuerpo: unknown,
  ): Promise<CajaChicaVista> {
    return this.casos
      .registrarVale(usuario.id, empresaId, cajaChicaId, validar(crearValeCajaChicaSchema, cuerpo))
      .catch(aHttp);
  }

  @Post(":cajaChicaId/reintegrar")
  @Permiso("tesoreria.registrar")
  reintegrar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("cajaChicaId", ParseUUIDPipe) cajaChicaId: string,
    @Body() cuerpo: unknown,
  ): Promise<CajaChicaVista> {
    return this.casos
      .reintegrar(usuario.id, empresaId, cajaChicaId, validar(reintegrarCajaChicaSchema, cuerpo))
      .catch(aHttp);
  }
}
