import {
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  UnprocessableEntityException,
} from "@nestjs/common";
import { crearConfiguracionPlanillaSchema, type ConfiguracionPlanillaVista } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { mensajeDeRegla } from "../../../../compartido/mensaje-regla-db.js";
import { CasosTasasPlanilla } from "../../application/casos-tasas-planilla.js";
import {
  ConfiguracionPlanillaDuplicadaError,
  EmpresaTasasPlanillaNoEncontradaError,
  ReglaTasasPlanillaError,
} from "../../domain/tasas-planilla.js";

function aHttp(error: unknown): never {
  if (error instanceof EmpresaTasasPlanillaNoEncontradaError) throw new NotFoundException(error.message);
  if (error instanceof ConfiguracionPlanillaDuplicadaError) throw new ConflictException(error.message);
  if (error instanceof ReglaTasasPlanillaError) throw new UnprocessableEntityException(error.message);
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

@Controller("empresas/:empresaId/tasas-planilla")
export class TasasPlanillaController {
  constructor(private readonly casos: CasosTasasPlanilla) {}

  @Get()
  @Permiso("empresa.configurar")
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<ConfiguracionPlanillaVista[]> {
    return this.casos.configuraciones(usuario.id, empresaId).catch(aHttp);
  }

  @Post()
  @Permiso("empresa.configurar")
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ConfiguracionPlanillaVista> {
    return this.casos
      .crear(usuario.id, empresaId, validar(crearConfiguracionPlanillaSchema, cuerpo))
      .catch(aHttp);
  }
}
