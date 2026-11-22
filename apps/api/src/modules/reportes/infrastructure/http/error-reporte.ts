import { ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import {
  EmpresaNoEncontradaError,
  PeriodoFueraDeEjercicioError,
  SinPermisoReportesError,
  SucursalNoAutorizadaError,
} from "../../domain/balanza.js";

export function lanzarErrorReporte(error: unknown): never {
  if (error instanceof EmpresaNoEncontradaError) throw new NotFoundException(error.message);
  if (error instanceof SinPermisoReportesError || error instanceof SucursalNoAutorizadaError) {
    throw new ForbiddenException(error.message);
  }
  if (error instanceof PeriodoFueraDeEjercicioError) {
    throw new UnprocessableEntityException(error.message);
  }
  throw error;
}
