import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnprocessableEntityException,
} from "@nestjs/common";
import { calcularPrestacionesSchema, type ResultadoCalculoPrestacionesVista } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import {
  LineasInvalidasError,
  NoEsBorradorError,
  PartidaDescuadradaError,
  SinPermisoPartidasError,
  SucursalNoAutorizadaError,
} from "../../../contabilidad/domain/partida-borrador.js";
import { ReglaContableError } from "../../../contabilidad/domain/contabilizacion.js";
import { CasosPrestaciones } from "../../application/casos-prestaciones.js";
import {
  CuentaPrestacionesInvalidaError,
  DatosPrestacionesInvalidosError,
  EmpresaPrestacionesNoEncontradaError,
  PartidaPrestacionesNoEditableError,
  SinEmpleadosPrestacionesError,
  SinPermisoPrestacionesError,
  SucursalPrestacionesNoAutorizadaError,
} from "../../domain/prestaciones.js";

function aHttp(error: unknown): never {
  if (error instanceof EmpresaPrestacionesNoEncontradaError) throw new NotFoundException(error.message);
  if (
    error instanceof SucursalPrestacionesNoAutorizadaError ||
    error instanceof SinPermisoPartidasError ||
    error instanceof SinPermisoPrestacionesError ||
    error instanceof SucursalNoAutorizadaError
  ) {
    throw new ForbiddenException(error.message);
  }
  if (error instanceof PartidaPrestacionesNoEditableError || error instanceof NoEsBorradorError) {
    throw new ConflictException(error.message);
  }
  if (
    error instanceof CuentaPrestacionesInvalidaError ||
    error instanceof DatosPrestacionesInvalidosError ||
    error instanceof SinEmpleadosPrestacionesError ||
    error instanceof LineasInvalidasError ||
    error instanceof PartidaDescuadradaError ||
    error instanceof ReglaContableError
  ) {
    throw new UnprocessableEntityException(error.message);
  }
  if (esDuplicadoDePrestacion(error)) {
    throw new ConflictException("Ya existe una provisión de prestaciones para la sucursal y el período.");
  }
  throw error;
}

function esDuplicadoDePrestacion(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const detalle = error as { message?: unknown; meta?: unknown };
  return (
    String(detalle.message ?? "").includes("partidas_prestaciones_sucursal_fecha_unq") ||
    JSON.stringify(detalle.meta ?? {}).includes("partidas_prestaciones_sucursal_fecha_unq")
  );
}

@Controller("empresas/:empresaId/prestaciones")
export class PrestacionesController {
  constructor(private readonly casos: CasosPrestaciones) {}

  @Post("calcular")
  @Permiso("planilla.calcular")
  calcular(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoCalculoPrestacionesVista> {
    return this.casos
      .calcular(usuario.id, empresaId, validar(calcularPrestacionesSchema, cuerpo))
      .catch(aHttp);
  }
}
