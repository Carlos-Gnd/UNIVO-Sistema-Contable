import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarTablero } from "../../application/consultar-tablero.js";
import {
  PeriodoTableroNoEncontradoError,
  SinPermisoTableroError,
  SucursalTableroNoAutorizadaError,
  TableroEmpresaNoEncontradaError,
} from "../../domain/tablero.js";

const consultaTableroSchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El mes debe tener el formato AAAA-MM."),
  sucursalId: z.string().uuid().optional(),
});

function aHttp(error: unknown): never {
  if (error instanceof TableroEmpresaNoEncontradaError || error instanceof PeriodoTableroNoEncontradoError) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof SinPermisoTableroError || error instanceof SucursalTableroNoAutorizadaError) {
    throw new ForbiddenException(error.message);
  }
  throw error;
}

/** Indicadores del tablero por mes y sucursal (HU-83, S4-T19). */
@Controller("empresas/:empresaId/tablero")
export class TableroController {
  constructor(private readonly consultar: ConsultarTablero) {}

  @Get()
  @Permiso("analitica.ver")
  ejecutar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ) {
    return this.consultar.ejecutar(usuario.id, empresaId, validar(consultaTableroSchema, query)).catch(aHttp);
  }
}
