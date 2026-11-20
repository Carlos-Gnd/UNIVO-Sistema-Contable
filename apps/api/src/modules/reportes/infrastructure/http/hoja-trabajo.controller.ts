import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { consultaHojaTrabajoSchema, type HojaTrabajo } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarHojaTrabajo } from "../../application/consultar-hoja-trabajo.js";
import { lanzarErrorReporte } from "./error-reporte.js";
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
      lanzarErrorReporte(error);
    }
  }
}
