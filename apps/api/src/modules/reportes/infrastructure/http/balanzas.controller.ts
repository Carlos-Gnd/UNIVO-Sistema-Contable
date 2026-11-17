import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import { consultaBalanzaSchema, tipoBalanzaSchema, type Balanza } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarBalanza } from "../../application/consultar-balanza.js";
import {
  EmpresaNoEncontradaError,
  PeriodoFueraDeEjercicioError,
  SinPermisoReportesError,
  SucursalNoAutorizadaError,
} from "../../domain/balanza.js";

@Controller("empresas/:empresaId/balanzas")
export class BalanzasController {
  constructor(private readonly consultar: ConsultarBalanza) {}

  /**
   * Balanza de comprobación (HU-30, S2-T29): tipo antes-ajustes, ajustada o posterior-cierre. Filtros en la
   * query: desde y hasta (AAAA-MM-DD, dentro de un mismo ejercicio) y sucursalId (sin ella, consolidada).
   */
  @Get(":tipo")
  @Permiso("reportes.ver")
  async balanza(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("tipo") tipo: string,
    @Query() query: unknown,
  ): Promise<Balanza> {
    const tipoBalanza = tipoBalanzaSchema.safeParse(tipo);
    if (!tipoBalanza.success) {
      throw new BadRequestException(
        "El tipo de balanza debe ser antes-ajustes, ajustada o posterior-cierre.",
      );
    }
    const consulta = validar(consultaBalanzaSchema, query);
    try {
      return await this.consultar.ejecutar(usuario.id, empresaId, tipoBalanza.data, consulta);
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
