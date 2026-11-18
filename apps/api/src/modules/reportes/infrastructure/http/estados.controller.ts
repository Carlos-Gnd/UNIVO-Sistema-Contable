import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  consultaBalanceGeneralSchema,
  consultaEstadoResultadosSchema,
  type BalanceGeneral,
  type EstadoResultados,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarBalanceGeneral, ConsultarEstadoResultados } from "../../application/consultar-estados.js";
import {
  EmpresaNoEncontradaError,
  PeriodoFueraDeEjercicioError,
  SinPermisoReportesError,
  SucursalNoAutorizadaError,
} from "../../domain/balanza.js";
import { PERMISO_VER_ESTADOS } from "../../domain/estados.js";

function aHttp(e: unknown): never {
  if (e instanceof EmpresaNoEncontradaError) throw new NotFoundException(e.message);
  if (e instanceof SinPermisoReportesError || e instanceof SucursalNoAutorizadaError) {
    throw new ForbiddenException(e.message);
  }
  if (e instanceof PeriodoFueraDeEjercicioError) throw new UnprocessableEntityException(e.message);
  throw e;
}

/** Estados financieros (HU-37 y HU-38). Requieren estados.ver. */
@Controller("empresas/:empresaId/estados")
export class EstadosController {
  constructor(
    private readonly estadoResultados: ConsultarEstadoResultados,
    private readonly balanceGeneral: ConsultarBalanceGeneral,
  ) {}

  /**
   * Estado de resultados (S2-T42). Query: desde y hasta (AAAA-MM-DD, dentro de un mismo ejercicio) y
   * sucursalId (sin ella, consolidado).
   */
  @Get("resultados")
  @Permiso(PERMISO_VER_ESTADOS)
  resultados(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<EstadoResultados> {
    const consulta = validar(consultaEstadoResultadosSchema, query);
    return this.estadoResultados.ejecutar(usuario.id, empresaId, consulta).catch(aHttp);
  }

  /** Balance general (S2-T46). Query: fecha (AAAA-MM-DD) y sucursalId (sin ella, consolidado). */
  @Get("balance-general")
  @Permiso(PERMISO_VER_ESTADOS)
  balance(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<BalanceGeneral> {
    const consulta = validar(consultaBalanceGeneralSchema, query);
    return this.balanceGeneral.ejecutar(usuario.id, empresaId, consulta).catch(aHttp);
  }
}
