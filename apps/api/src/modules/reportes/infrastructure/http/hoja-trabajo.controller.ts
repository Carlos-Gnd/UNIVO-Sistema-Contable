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
import { consultaHojaTrabajoSchema, type HojaTrabajo } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarHojaTrabajo } from "../../application/consultar-hoja-trabajo.js";
import {
  EmpresaNoEncontradaError,
  PeriodoFueraDeEjercicioError,
  SinPermisoReportesError,
  SucursalNoAutorizadaError,
} from "../../domain/balanza.js";
import { PERMISO_VER_ESTADOS } from "../../domain/estados.js";

@Controller("empresas/:empresaId/hoja-trabajo")
export class HojaTrabajoController {
  constructor(private readonly consultar: ConsultarHojaTrabajo) {}

  /** Hoja de trabajo de diez columnas (S2-T33). Query: desde, hasta y sucursalId opcional. */
  @Get()
  @Permiso(PERMISO_VER_ESTADOS)
  async hoja(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<HojaTrabajo> {
    const consulta = validar(consultaHojaTrabajoSchema, query);
    try {
      return await this.consultar.ejecutar(usuario.id, empresaId, consulta);
    } catch (error) {
      if (error instanceof EmpresaNoEncontradaError) throw new NotFoundException(error.message);
      if (error instanceof SinPermisoReportesError || error instanceof SucursalNoAutorizadaError) {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof PeriodoFueraDeEjercicioError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
  }
}
