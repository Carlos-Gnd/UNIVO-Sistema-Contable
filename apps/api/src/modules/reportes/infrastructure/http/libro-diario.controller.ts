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
import { consultaLibroDiarioSchema, type LibroDiario } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarLibroDiario } from "../../application/consultar-libro-diario.js";
import {
  EmpresaNoEncontradaError,
  PERMISO_VER_REPORTES,
  PeriodoFueraDeEjercicioError,
  SinPermisoReportesError,
  SucursalNoAutorizadaError,
} from "../../domain/balanza.js";

@Controller("empresas/:empresaId/libro-diario")
export class LibroDiarioController {
  constructor(private readonly consultar: ConsultarLibroDiario) {}

  /**
   * Libro diario en el formato de clase (HU-25, S2-T15 y S2-T16). Query: desde y hasta (AAAA-MM-DD, dentro
   * de un mismo ejercicio), tipo de partida, sucursalId (sin ella, consolidado), renglonesPorPagina (10 a
   * 100, 40 por defecto) y folioInicial (1 por defecto). Devuelve las páginas con su folio, sus renglones y
   * los totales Vienen y Pasan, listas para la pantalla y la exportación a PDF y Excel.
   */
  @Get()
  @Permiso(PERMISO_VER_REPORTES)
  async libro(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<LibroDiario> {
    const consulta = validar(consultaLibroDiarioSchema, query);
    try {
      return await this.consultar.ejecutar(usuario.id, empresaId, consulta);
    } catch (e) {
      if (e instanceof EmpresaNoEncontradaError) throw new NotFoundException(e.message);
      if (e instanceof SinPermisoReportesError || e instanceof SucursalNoAutorizadaError) {
        throw new ForbiddenException(e.message);
      }
      if (e instanceof PeriodoFueraDeEjercicioError) throw new UnprocessableEntityException(e.message);
      throw e;
    }
  }
}
