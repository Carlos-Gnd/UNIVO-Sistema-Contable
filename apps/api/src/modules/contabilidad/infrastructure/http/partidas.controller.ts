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
  NoEsPartidaContabilizadaError,
  PartidaNoEncontradaError,
  PartidaDescuadradaError,
  SinPermisoPartidasError,
  SucursalNoAutorizadaError,
} from "../../domain/partida-borrador.js";
import { AutorizaEnCasoDeUso } from "../../../../compartido/permiso.decorator.js";

/** Traduce los errores del registro de partidas a respuestas HTTP. */
function aHttp(e: unknown): never {
  if (e instanceof EmpresaNoEncontradaError || e instanceof PartidaNoEncontradaError) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof SinPermisoPartidasError || e instanceof SucursalNoAutorizadaError) {
    throw new ForbiddenException(e.message);
  }
  if (e instanceof NoEsBorradorError) throw new ConflictException(e.message);
  if (e instanceof NoEsPartidaContabilizadaError) throw new ConflictException(e.message);
  if (e instanceof LineasInvalidasError) {
    throw new UnprocessableEntityException({ mensaje: e.message, lineas: e.errores });
  }
  if (e instanceof PartidaDescuadradaError) throw new UnprocessableEntityException({ mensaje: e.message });
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

  /** Lista los borradores de las sucursales visibles, con su diferencia debe/haber (S1-T82). */
  @AutorizaEnCasoDeUso("El caso de uso valida el permiso de partidas y las sucursales del usuario.")
  @Get("borradores")
  listarBorradores(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<PartidaVista[]> {
    return this.partidas.listarBorradores(usuario.id, empresaId).catch(aHttp);
  }

  @AutorizaEnCasoDeUso("El caso de uso valida el permiso de partidas y las sucursales del usuario.")
  @Post()
  async crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PartidaVista> {
    const datos = validar(crearPartidaSchema, cuerpo);
    return this.partidas.crear(usuario.id, empresaId, datos).catch(aHttp);
  }

  @AutorizaEnCasoDeUso("El caso de uso valida el permiso de partidas y las sucursales del usuario.")
  @Get(":partidaId")
  async consultar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("partidaId", ParseUUIDPipe) partidaId: string,
  ): Promise<PartidaVista> {
    return this.partidas.consultar(usuario.id, empresaId, partidaId).catch(aHttp);
  }

  /** Devuelve las versiones anteriores de la partida, de la más reciente a la más antigua (S2-T07). */
  @AutorizaEnCasoDeUso("El caso de uso valida el permiso de partidas y las sucursales del usuario.")
  @Get(":partidaId/versiones")
  async consultarVersiones(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("partidaId", ParseUUIDPipe) partidaId: string,
  ) {
    return this.partidas.consultarVersiones(usuario.id, empresaId, partidaId).catch(aHttp);
  }

  /** Reemplaza la cabecera y las líneas de un borrador. */
  @AutorizaEnCasoDeUso("El caso de uso valida el permiso de partidas y las sucursales del usuario.")
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

  /** Reemplaza los datos de una partida contabilizada; la base conserva automáticamente la versión anterior (HU-23). */
  @AutorizaEnCasoDeUso("El caso de uso valida el permiso de partidas y las sucursales del usuario.")
  @Put(":partidaId/contabilizada")
  async editarContabilizada(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("partidaId", ParseUUIDPipe) partidaId: string,
    @Body() cuerpo: unknown,
  ): Promise<PartidaVista> {
    const datos = validar(editarPartidaSchema, cuerpo);
    return this.partidas.editarContabilizada(usuario.id, empresaId, partidaId, datos).catch(aHttp);
  }
}
