import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  consultaDepreciacionSchema,
  generarDepreciacionSchema,
  type CuadroActivo,
  type ResultadoDepreciacion,
  type VistaDepreciacionMes,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { DepreciarActivos } from "../../application/depreciar-activos.js";
import { PERMISO_VER_ACTIVOS } from "../../domain/activo-fijo.js";
import {
  DepreciacionBloqueadaError,
  PERMISO_GENERAR_DEPRECIACION,
  SinDepreciacionPendienteError,
} from "../../domain/depreciacion.js";
import { aHttp } from "./activos-fijos.controller.js";

function aHttpDepreciacion(e: unknown): never {
  // Nada que depreciar en el mes, o meses anteriores sin generar: el estado de los activos lo impide
  if (e instanceof SinDepreciacionPendienteError || e instanceof DepreciacionBloqueadaError) {
    throw new ConflictException(e.message);
  }
  return aHttp(e);
}

/** Depreciación mensual de los activos fijos (HU-82). */
@Controller("empresas/:empresaId")
export class DepreciacionController {
  constructor(private readonly depreciar: DepreciarActivos) {}

  /** Vista previa del mes (query: mes=AAAA-MM): cuota por activo y partidas que se generarían. */
  @Get("depreciacion")
  @Permiso(PERMISO_VER_ACTIVOS)
  consultar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<VistaDepreciacionMes> {
    const { mes } = validar(consultaDepreciacionSchema, query);
    return this.depreciar.consultar(usuario.id, empresaId, mes).catch(aHttpDepreciacion);
  }

  /**
   * Genera y contabiliza la depreciación del mes (S3-T130): una partida de ajuste por sucursal. Requiere
   * ajustes.generar (contador y administrador).
   */
  @Post("depreciacion")
  @Permiso(PERMISO_GENERAR_DEPRECIACION)
  generar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoDepreciacion> {
    const { mes } = validar(generarDepreciacionSchema, cuerpo);
    return this.depreciar.generar(usuario.id, empresaId, mes).catch(aHttpDepreciacion);
  }

  /** Cuadro de depreciación de un activo, mes por mes. */
  @Get("activos-fijos/:activoId/cuadro")
  @HttpCode(200)
  @Permiso(PERMISO_VER_ACTIVOS)
  cuadro(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("activoId", ParseUUIDPipe) activoId: string,
  ): Promise<CuadroActivo> {
    return this.depreciar.cuadro(usuario.id, empresaId, activoId).catch(aHttpDepreciacion);
  }
}
