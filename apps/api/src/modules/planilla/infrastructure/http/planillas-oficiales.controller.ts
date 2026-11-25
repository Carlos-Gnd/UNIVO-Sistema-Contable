import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  consultarPlanillaOficialSchema,
  presentarPlanillaOficialSchema,
  type PresentacionPlanillaOficialVista,
  type ResultadoPlanillasOficialesVista,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosPlanillasOficiales } from "../../application/casos-planillas-oficiales.js";
import {
  EmpresaPlanillaOficialNoEncontradaError,
  PlanillaOficialYaPresentadaError,
  SinAccesoCompletoPlanillaError,
  SinDatosPlanillaOficialError,
} from "../../domain/planillas-oficiales.js";

function aHttp(error: unknown): never {
  if (error instanceof EmpresaPlanillaOficialNoEncontradaError) throw new NotFoundException(error.message);
  if (error instanceof SinAccesoCompletoPlanillaError) throw new ForbiddenException(error.message);
  if (error instanceof PlanillaOficialYaPresentadaError || esDuplicado(error)) {
    throw new ConflictException(new PlanillaOficialYaPresentadaError().message);
  }
  if (error instanceof SinDatosPlanillaOficialError) throw new UnprocessableEntityException(error.message);
  throw error;
}

function esDuplicado(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "P2002";
}

@Controller("empresas/:empresaId/planillas-oficiales")
export class PlanillasOficialesController {
  constructor(private readonly casos: CasosPlanillasOficiales) {}

  @Get()
  @Permiso("planilla.ver")
  consultar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query("periodo") periodo: string,
  ): Promise<ResultadoPlanillasOficialesVista> {
    const consulta = validar(consultarPlanillaOficialSchema, { periodo });
    return this.casos.consultar(usuario.id, empresaId, consulta.periodo).catch(aHttp);
  }

  @Post("presentar")
  @Permiso("planilla.calcular")
  presentar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PresentacionPlanillaOficialVista> {
    return this.casos
      .presentar(usuario.id, empresaId, validar(presentarPlanillaOficialSchema, cuerpo))
      .catch(aHttp);
  }
}
