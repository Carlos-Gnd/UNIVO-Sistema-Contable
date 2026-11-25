import {
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnprocessableEntityException,
  Body,
  ConflictException,
} from "@nestjs/common";
import { calcularPlanillaSchema, type ResultadoCalculoPlanillaVista } from "@contable/shared";
import {
  LineasInvalidasError,
  NoEsBorradorError,
  PartidaDescuadradaError,
  SinPermisoPartidasError,
  SucursalNoAutorizadaError,
} from "../../../contabilidad/domain/partida-borrador.js";
import { ReglaContableError } from "../../../contabilidad/domain/contabilizacion.js";
import { Throttle } from "@nestjs/throttler";
import { LIMITE_PESADO } from "../../../../compartido/limite-peticiones.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosCalculoPlanilla } from "../../application/casos-calculo-planilla.js";
import {
  ConfiguracionPlanillaNoEncontradaError,
  CuentaPlanillaInvalidaError,
  DatosPlanillaInvalidosError,
  EmpresaPlanillaNoEncontradaError,
  PartidaPlanillaNoEditableError,
  PlanillaYaPresentadaError,
  SinEmpleadosPlanillaError,
  SinPermisoCalculoPlanillaError,
  SucursalPlanillaNoAutorizadaError,
} from "../../domain/calculo-planilla.js";

function aHttp(error: unknown): never {
  if (error instanceof EmpresaPlanillaNoEncontradaError) throw new NotFoundException(error.message);
  if (
    error instanceof SucursalPlanillaNoAutorizadaError ||
    error instanceof SinPermisoPartidasError ||
    error instanceof SinPermisoCalculoPlanillaError ||
    error instanceof SucursalNoAutorizadaError
  ) {
    throw new ForbiddenException(error.message);
  }
  if (
    error instanceof PartidaPlanillaNoEditableError ||
    error instanceof PlanillaYaPresentadaError ||
    error instanceof NoEsBorradorError
  ) {
    throw new ConflictException(error.message);
  }
  if (
    error instanceof CuentaPlanillaInvalidaError ||
    error instanceof ConfiguracionPlanillaNoEncontradaError ||
    error instanceof SinEmpleadosPlanillaError ||
    error instanceof DatosPlanillaInvalidosError ||
    error instanceof LineasInvalidasError ||
    error instanceof PartidaDescuadradaError ||
    error instanceof ReglaContableError
  ) {
    throw new UnprocessableEntityException(error.message);
  }
  if (esDuplicadoDePlanilla(error)) {
    throw new ConflictException(
      "Ya existe una partida de planilla para la sucursal y el período seleccionados.",
    );
  }
  throw error;
}

function esDuplicadoDePlanilla(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const detalle = error as { message?: unknown; meta?: unknown };
  return (
    String(detalle.message ?? "").includes("partidas_planilla_sucursal_fecha_unq") ||
    JSON.stringify(detalle.meta ?? {}).includes("partidas_planilla_sucursal_fecha_unq")
  );
}

@Controller("empresas/:empresaId/planillas")
export class CalculoPlanillaController {
  constructor(private readonly casos: CasosCalculoPlanilla) {}

  @Throttle(LIMITE_PESADO)
  @Post("calcular")
  @Permiso("planilla.calcular")
  calcular(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoCalculoPlanillaVista> {
    return this.casos.calcular(usuario.id, empresaId, validar(calcularPlanillaSchema, cuerpo)).catch(aHttp);
  }
}
