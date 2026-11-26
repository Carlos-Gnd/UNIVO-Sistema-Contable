import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  consultaAlertasSchema,
  consultaCalendarioSchema,
  marcarPresentadaSchema,
  obligacionSchema,
  periodoSchema,
  type AlertasTributarias,
  type CalendarioTributario,
  type Vencimiento,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ServicioCalendarioTributario } from "../../application/calendario-tributario.js";
import {
  EmpresaNoEncontradaError,
  PERMISO_MARCAR_PRESENTADA,
  PERMISO_VER_CALENDARIO,
  SinPermisoCalendarioError,
} from "../../domain/calendario.js";

function aHttp(e: unknown): never {
  if (e instanceof EmpresaNoEncontradaError) throw new NotFoundException(e.message);
  if (e instanceof SinPermisoCalendarioError) throw new ForbiddenException(e.message);
  throw e;
}

/** Calendario tributario (HU-52): vencimientos de F-07, F-14 y planillas de ISSS y AFP. */
@Controller("empresas/:empresaId/calendario-tributario")
export class CalendarioController {
  constructor(private readonly calendario: ServicioCalendarioTributario) {}

  /** Vencimientos entre `desde` y `hasta` (AAAA-MM-DD), con su estado a hoy. Requiere declaraciones.ver. */
  @Get()
  @Permiso(PERMISO_VER_CALENDARIO)
  consultar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<CalendarioTributario> {
    return this.calendario
      .consultar(usuario.id, empresaId, validar(consultaCalendarioSchema, query))
      .catch(aHttp);
  }

  /** Alerta del tablero: sin presentar y con cinco días o menos, o ya vencidos. */
  @Get("alertas")
  @Permiso(PERMISO_VER_CALENDARIO)
  alertas(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<AlertasTributarias> {
    const { hoy } = validar(consultaAlertasSchema, query);
    return this.calendario.alertas(usuario.id, empresaId, hoy).catch(aHttp);
  }

  /** Marca el vencimiento del período como presentado. Requiere declaraciones.generar. */
  @Post(":obligacion/:periodo/presentada")
  @HttpCode(200)
  @Permiso(PERMISO_MARCAR_PRESENTADA)
  marcar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("obligacion") obligacion: string,
    @Param("periodo") periodo: string,
    @Body() cuerpo: unknown,
  ): Promise<Vencimiento> {
    const o = validar(obligacionSchema, obligacion);
    const p = validar(periodoSchema, periodo);
    const { nota } = validar(marcarPresentadaSchema, cuerpo ?? {});
    return this.calendario.marcar(usuario.id, empresaId, o, p, nota ?? null).catch(aHttp);
  }

  /** Quita la marca de presentado. */
  @Delete(":obligacion/:periodo/presentada")
  @Permiso(PERMISO_MARCAR_PRESENTADA)
  desmarcar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("obligacion") obligacion: string,
    @Param("periodo") periodo: string,
  ): Promise<Vencimiento> {
    const o = validar(obligacionSchema, obligacion);
    const p = validar(periodoSchema, periodo);
    return this.calendario.desmarcar(usuario.id, empresaId, o, p).catch(aHttp);
  }
}
