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
  Put,
  UnprocessableEntityException,
} from "@nestjs/common";
import { crearPartidaSchema, editarPartidaSchema, type PartidaVista } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { PartidasBorrador } from "../../application/partidas-borrador.js";
import { ReglaContableError } from "../../domain/contabilizacion.js";
import {
  EmpresaNoEncontradaError,
  LineasInvalidasError,
  NoEsBorradorError,
  PartidaNoEncontradaError,
  SinPermisoPartidasError,
  SucursalNoAutorizadaError,
} from "../../domain/partida-borrador.js";

/** Traduce los errores del registro de partidas a respuestas HTTP. */
function aHttp(e: unknown): never {
  if (e instanceof EmpresaNoEncontradaError || e instanceof PartidaNoEncontradaError) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof SinPermisoPartidasError || e instanceof SucursalNoAutorizadaError) {
    throw new ForbiddenException(e.message);
  }
  if (e instanceof NoEsBorradorError) throw new ConflictException(e.message);
  if (e instanceof LineasInvalidasError) {
    throw new UnprocessableEntityException({ mensaje: e.message, lineas: e.errores });
  }
  if (e instanceof ReglaContableError) throw new UnprocessableEntityException({ mensaje: e.message });
  throw e;
}

/**
 * Registro de partidas manuales en borrador (HU-20, S1-T78). Un borrador puede quedar descuadrado; se
 * contabiliza después con POST …/partidas/:id/contabilizar (HU-22).
 */
@Controller("empresas/:empresaId/partidas")
export class PartidasController {
  constructor(private readonly partidas: PartidasBorrador) {}

  @Post()
  async crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PartidaVista> {
    const datos = validar(crearPartidaSchema, cuerpo);
    return this.partidas.crear(usuario.id, empresaId, datos).catch(aHttp);
  }

  @Get(":partidaId")
  async consultar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("partidaId", ParseUUIDPipe) partidaId: string,
  ): Promise<PartidaVista> {
    return this.partidas.consultar(usuario.id, empresaId, partidaId).catch(aHttp);
  }

  /** Reemplaza la cabecera y las líneas de un borrador. */
  @Put(":partidaId")
  async editar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("partidaId", ParseUUIDPipe) partidaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PartidaVista> {
    const datos = validar(editarPartidaSchema, cuerpo);
    return this.partidas.editar(usuario.id, empresaId, partidaId, datos).catch(aHttp);
  }
}
