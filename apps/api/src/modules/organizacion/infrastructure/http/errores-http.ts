import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  CodigoSucursalDuplicadoError,
  EmpresaNoEncontradaError,
  NitDuplicadoError,
  ReglaEmpresaError,
  SinPermisoError,
  SucursalNoEncontradaError,
} from "../../domain/empresa.js";

/** Traduce los errores del dominio organización a respuestas HTTP. */
export function aHttp(e: unknown): never {
  if (e instanceof EmpresaNoEncontradaError || e instanceof SucursalNoEncontradaError) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof SinPermisoError) throw new ForbiddenException(e.message);
  if (e instanceof NitDuplicadoError || e instanceof CodigoSucursalDuplicadoError) {
    throw new ConflictException(e.message);
  }
  if (e instanceof ReglaEmpresaError) throw new UnprocessableEntityException(e.message);
  throw e;
}
