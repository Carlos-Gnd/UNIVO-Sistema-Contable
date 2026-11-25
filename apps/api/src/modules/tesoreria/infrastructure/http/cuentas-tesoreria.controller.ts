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
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  crearCuentaTesoreriaSchema,
  editarCuentaTesoreriaSchema,
  type CuentaTesoreriaVista,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosTesoreria } from "../../application/casos-cuenta-tesoreria.js";
import {
  CuentaBancariaDuplicadaError,
  CuentaContableEnUsoError,
  CuentaContableNoEncontradaError,
  CuentaTesoreriaNoEncontradaError,
  ReglaTesoreriaError,
  SucursalNoAutorizadaError,
  SucursalNoEncontradaError,
} from "../../domain/cuenta-tesoreria.js";

/** Traduce los errores del dominio de tesorería a respuestas HTTP. */
function aHttp(e: unknown): never {
  if (
    e instanceof CuentaTesoreriaNoEncontradaError ||
    e instanceof CuentaContableNoEncontradaError ||
    e instanceof SucursalNoEncontradaError
  ) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof SucursalNoAutorizadaError) throw new ForbiddenException(e.message);
  if (e instanceof CuentaContableEnUsoError || e instanceof CuentaBancariaDuplicadaError) {
    throw new ConflictException(e.message);
  }
  if (e instanceof ReglaTesoreriaError) throw new UnprocessableEntityException(e.message);
  throw e;
}

/** Cajas y cuentas bancarias de la empresa con su saldo actual (HU-76, S3-T112). No hay DELETE: se inactivan. */
@Controller("empresas/:empresaId/cuentas-tesoreria")
export class CuentasTesoreriaController {
  constructor(private readonly casos: CasosTesoreria) {}

  @Get()
  @Permiso("tesoreria.ver")
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<CuentaTesoreriaVista[]> {
    return this.casos.listar(usuario.id, empresaId).catch(aHttp);
  }

  @Post()
  @Permiso("tesoreria.registrar")
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<CuentaTesoreriaVista> {
    return this.casos.crear(usuario.id, empresaId, validar(crearCuentaTesoreriaSchema, cuerpo)).catch(aHttp);
  }

  @Patch(":cuentaTesoreriaId")
  @Permiso("tesoreria.registrar")
  editar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("cuentaTesoreriaId", ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ): Promise<CuentaTesoreriaVista> {
    return this.casos
      .editar(usuario.id, empresaId, id, validar(editarCuentaTesoreriaSchema, cuerpo))
      .catch(aHttp);
  }
}
