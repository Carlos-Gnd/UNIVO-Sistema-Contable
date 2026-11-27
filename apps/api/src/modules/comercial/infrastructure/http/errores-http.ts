import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  ProductoNoEncontradoError,
  ReglaProductoError,
  SerieDuplicadaError,
  SucursalNoAutorizadaError,
  SucursalNoEncontradaError,
} from "../../../inventario/domain/producto.js";
import { DocumentoDuplicadoError, DocumentoNoEncontradoError } from "../../domain/documento.js";
import { AbonoNoEncontradoError } from "../../domain/abono.js";
import { NotaDuplicadaError, NotaNoEncontradaError } from "../../domain/nota.js";
import { ReglaComercialError, TerceroNoEncontradoError } from "../../domain/tercero.js";

/** Traduce los errores de compras y ventas (y los del kardex que reutilizan) a respuestas HTTP. */
export function aHttpDocumento(e: unknown): never {
  if (
    e instanceof DocumentoNoEncontradoError ||
    e instanceof NotaNoEncontradaError ||
    e instanceof AbonoNoEncontradoError ||
    e instanceof TerceroNoEncontradoError ||
    e instanceof ProductoNoEncontradoError ||
    e instanceof SucursalNoEncontradaError
  ) {
    throw new NotFoundException(e.message);
  }
  if (
    e instanceof DocumentoDuplicadoError ||
    e instanceof NotaDuplicadaError ||
    // Una serie (IMEI) repetida en una compra o una venta es un conflicto, no un error del servidor
    e instanceof SerieDuplicadaError
  ) {
    throw new ConflictException(e.message);
  }
  if (e instanceof SucursalNoAutorizadaError) throw new ForbiddenException(e.message);
  if (e instanceof ReglaComercialError || e instanceof ReglaProductoError) {
    throw new UnprocessableEntityException(e.message);
  }
  throw e;
}
