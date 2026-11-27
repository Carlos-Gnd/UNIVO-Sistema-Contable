import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  crearActivoFijoSchema,
  darBajaActivoSchema,
  type ActivoFijoVista,
  type ResultadoAltaActivo,
  type ResultadoBajaActivo,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { AdministrarActivos } from "../../application/administrar-activos.js";
import {
  ActivoNoEncontradoError,
  ActivoYaDadoDeBajaError,
  CuentaInvalidaError,
  EmpresaNoEncontradaError,
  FechaBajaInvalidaError,
  PERMISO_REGISTRAR_ACTIVOS,
  PERMISO_VER_ACTIVOS,
  PartidaInvalidaError,
  ReglaContableError,
  SinPermisoActivoFijoError,
  SucursalNoAutorizadaError,
} from "../../domain/activo-fijo.js";

/** Traduce los errores del módulo a respuestas HTTP. */
export function aHttp(e: unknown): never {
  if (e instanceof EmpresaNoEncontradaError || e instanceof ActivoNoEncontradoError) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof SinPermisoActivoFijoError || e instanceof SucursalNoAutorizadaError) {
    throw new ForbiddenException(e.message);
  }
  if (e instanceof ActivoYaDadoDeBajaError) throw new ConflictException(e.message);
  if (e instanceof CuentaInvalidaError || e instanceof FechaBajaInvalidaError) {
    throw new BadRequestException(e.message);
  }
  // La partida generada no pasa la validación, o la base la rechazó (período cerrado, por ejemplo)
  if (e instanceof PartidaInvalidaError || e instanceof ReglaContableError) {
    throw new UnprocessableEntityException(e.message);
  }
  throw e;
}

/** Activos fijos de la empresa (HU-81). */
@Controller("empresas/:empresaId/activos-fijos")
export class ActivosFijosController {
  constructor(private readonly activos: AdministrarActivos) {}

  /** Lista los activos de las sucursales que el usuario ve. Requiere activo_fijo.ver. */
  @Get()
  @Permiso(PERMISO_VER_ACTIVOS)
  listar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<ActivoFijoVista[]> {
    return this.activos.listar(usuario.id, empresaId).catch(aHttp);
  }

  /**
   * Registra un activo (S3-T127). Con `contrapartidaId` genera y contabiliza la partida de adquisición.
   * Requiere activo_fijo.registrar.
   */
  @Post()
  @Permiso(PERMISO_REGISTRAR_ACTIVOS)
  registrar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoAltaActivo> {
    const datos = validar(crearActivoFijoSchema, cuerpo);
    return this.activos.registrar(usuario.id, empresaId, datos).catch(aHttp);
  }

  /** Da de baja el activo con su partida (retira el costo y la depreciación y registra la pérdida). */
  @Post(":activoId/baja")
  @HttpCode(200)
  @Permiso(PERMISO_REGISTRAR_ACTIVOS)
  darDeBaja(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("activoId", ParseUUIDPipe) activoId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoBajaActivo> {
    const datos = validar(darBajaActivoSchema, cuerpo);
    return this.activos.darDeBaja(usuario.id, empresaId, activoId, datos).catch(aHttp);
  }
}
