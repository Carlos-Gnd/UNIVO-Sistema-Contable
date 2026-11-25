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
  cambiarEstadoChequeSchema,
  crearMovimientoBancarioSchema,
  filtrarMovimientosBancariosSchema,
  type MovimientoBancarioVista,
} from "@contable/shared";
import { mensajeDeRegla } from "../../../../compartido/mensaje-regla-db.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosMovimientosBancarios } from "../../application/casos-movimientos-bancarios.js";
import {
  CuentaBancariaMovimientoNoEncontradaError,
  MovimientoBancarioDuplicadoError,
  MovimientoBancarioEmpresaNoEncontradaError,
  MovimientoBancarioNoEncontradoError,
  ReglaMovimientoBancarioError,
  SucursalMovimientoBancarioNoAutorizadaError,
  SucursalMovimientoBancarioNoEncontradaError,
} from "../../domain/movimiento-bancario.js";

function aHttp(error: unknown): never {
  if (
    error instanceof MovimientoBancarioEmpresaNoEncontradaError ||
    error instanceof MovimientoBancarioNoEncontradoError ||
    error instanceof CuentaBancariaMovimientoNoEncontradaError ||
    error instanceof SucursalMovimientoBancarioNoEncontradaError
  ) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof SucursalMovimientoBancarioNoAutorizadaError) {
    throw new ForbiddenException(error.message);
  }
  if (error instanceof MovimientoBancarioDuplicadoError) throw new ConflictException(error.message);
  if (error instanceof ReglaMovimientoBancarioError) throw new UnprocessableEntityException(error.message);
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

@Controller("empresas/:empresaId/movimientos-bancarios")
export class MovimientosBancariosController {
  constructor(private readonly casos: CasosMovimientosBancarios) {}

  @Get()
  @Permiso("tesoreria.ver")
  listar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: unknown,
  ): Promise<MovimientoBancarioVista[]> {
    return this.casos
      .listar(usuario.id, empresaId, validar(filtrarMovimientosBancariosSchema, consulta))
      .catch(aHttp);
  }

  @Post()
  @Permiso("tesoreria.registrar")
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<MovimientoBancarioVista> {
    return this.casos
      .crear(usuario.id, empresaId, validar(crearMovimientoBancarioSchema, cuerpo))
      .catch(aHttp);
  }

  @Patch(":movimientoId/estado-cheque")
  @Permiso("tesoreria.registrar")
  cambiarEstado(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("movimientoId", ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ): Promise<MovimientoBancarioVista> {
    return this.casos
      .cambiarEstado(usuario.id, empresaId, id, validar(cambiarEstadoChequeSchema, cuerpo))
      .catch(aHttp);
  }
}
