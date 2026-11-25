import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  aprobarTomaFisicaSchema,
  crearTomaFisicaSchema,
  guardarConteoTomaFisicaSchema,
  idSchema,
  type TomaFisicaVista,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosTomaFisica } from "../../application/casos-toma-fisica.js";
import {
  ReglaProductoError,
  SerieDuplicadaError,
  SucursalNoAutorizadaError,
  SucursalNoEncontradaError,
} from "../../domain/producto.js";
import {
  TomaFisicaAbiertaError,
  TomaFisicaNoEncontradaError,
  TomaFisicaSinPermisoError,
} from "../../domain/toma-fisica.js";

function aHttp(e: unknown): never {
  if (e instanceof TomaFisicaNoEncontradaError || e instanceof SucursalNoEncontradaError) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof TomaFisicaAbiertaError || e instanceof SerieDuplicadaError) {
    throw new ConflictException(e.message);
  }
  if (e instanceof SucursalNoAutorizadaError || e instanceof TomaFisicaSinPermisoError) {
    throw new ForbiddenException(e.message);
  }
  if (e instanceof ReglaProductoError) throw new UnprocessableEntityException(e.message);
  throw e;
}

/** Conteo, captura y aprobación de la toma física (HU-68). */
@Controller("empresas/:empresaId/tomas-fisicas")
export class TomasFisicasController {
  constructor(private readonly casos: CasosTomaFisica) {}

  @Get()
  @Permiso("inventario.ver")
  consultar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query("sucursalId") sucursalId: string,
  ): Promise<TomaFisicaVista | null> {
    return this.casos.consultar(usuario.id, empresaId, validar(idSchema, sucursalId)).catch(aHttp);
  }

  @Post()
  @Permiso("inventario.contar")
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<TomaFisicaVista> {
    return this.casos.crear(usuario.id, empresaId, validar(crearTomaFisicaSchema, cuerpo)).catch(aHttp);
  }

  @Patch(":tomaId/conteo")
  @Permiso("inventario.contar")
  guardar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("tomaId", ParseUUIDPipe) tomaId: string,
    @Body() cuerpo: unknown,
  ): Promise<TomaFisicaVista> {
    return this.casos
      .guardar(usuario.id, empresaId, tomaId, validar(guardarConteoTomaFisicaSchema, cuerpo).lineas)
      .catch(aHttp);
  }

  @Post(":tomaId/aprobar")
  @Permiso("inventario.aprobar_ajuste")
  aprobar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("tomaId", ParseUUIDPipe) tomaId: string,
    @Body() cuerpo: unknown,
  ): Promise<TomaFisicaVista> {
    return this.casos
      .aprobar(usuario.id, empresaId, tomaId, validar(aprobarTomaFisicaSchema, cuerpo))
      .catch(aHttp);
  }
}
