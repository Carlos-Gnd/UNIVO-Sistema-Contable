import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  crearPlantillaRecurrenteSchema,
  editarPlantillaRecurrenteSchema,
  generarPartidaRecurrenteSchema,
  type PartidaDisponibleVista,
  type PartidaGeneradaVista,
  type PlantillaRecurrenteVista,
  type ResultadoGenerarMesVista,
} from "@contable/shared";
import { Throttle } from "@nestjs/throttler";
import { LIMITE_PESADO } from "../../../../compartido/limite-peticiones.js";
import { mensajeDeRegla } from "../../../../compartido/mensaje-regla-db.js";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosRecurrentes } from "../../application/casos-recurrentes.js";
import {
  NombrePlantillaDuplicadoError,
  PartidaDelMesYaGeneradaError,
  PartidaRecurrenteNoEncontradaError,
  PlantillaRecurrenteNoEncontradaError,
  RecurrenteEmpresaNoEncontradaError,
  ReglaRecurrenteError,
  SucursalRecurrenteNoAutorizadaError,
} from "../../domain/recurrentes.js";

function aHttp(error: unknown): never {
  if (
    error instanceof RecurrenteEmpresaNoEncontradaError ||
    error instanceof PartidaRecurrenteNoEncontradaError ||
    error instanceof PlantillaRecurrenteNoEncontradaError
  ) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof SucursalRecurrenteNoAutorizadaError) throw new ForbiddenException(error.message);
  if (error instanceof NombrePlantillaDuplicadoError || error instanceof PartidaDelMesYaGeneradaError) {
    throw new ConflictException(error.message);
  }
  if (error instanceof ReglaRecurrenteError) throw new UnprocessableEntityException(error.message);
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

/** Plantillas de partidas recurrentes (HU-26, S3-T04). */
@Controller("empresas/:empresaId/partidas-recurrentes")
export class RecurrentesController {
  constructor(private readonly casos: CasosRecurrentes) {}

  @Get()
  @Permiso("partidas.ver")
  listar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<PlantillaRecurrenteVista[]> {
    return this.casos.listar(usuario.id, empresaId).catch(aHttp);
  }

  @Get("partidas-disponibles")
  @Permiso("partidas.ver")
  partidasDisponibles(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<PartidaDisponibleVista[]> {
    return this.casos.partidasDisponibles(usuario.id, empresaId).catch(aHttp);
  }

  @Post("generar-mes")
  @Throttle(LIMITE_PESADO)
  @Permiso("partidas.registrar")
  generarMes(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoGenerarMesVista> {
    return this.casos
      .generarMes(usuario.id, empresaId, validar(generarPartidaRecurrenteSchema, cuerpo))
      .catch(aHttp);
  }

  @Post()
  @Permiso("partidas.registrar")
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PlantillaRecurrenteVista> {
    return this.casos
      .crearDesdePartida(usuario.id, empresaId, validar(crearPlantillaRecurrenteSchema, cuerpo))
      .catch(aHttp);
  }

  @Patch(":plantillaId")
  @Permiso("partidas.registrar")
  editar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("plantillaId", ParseUUIDPipe) plantillaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PlantillaRecurrenteVista> {
    return this.casos
      .editar(usuario.id, empresaId, plantillaId, validar(editarPlantillaRecurrenteSchema, cuerpo))
      .catch(aHttp);
  }

  @Post(":plantillaId/generar")
  @Permiso("partidas.registrar")
  generar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("plantillaId", ParseUUIDPipe) plantillaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PartidaGeneradaVista> {
    return this.casos
      .generar(usuario.id, empresaId, plantillaId, validar(generarPartidaRecurrenteSchema, cuerpo))
      .catch(aHttp);
  }
}
