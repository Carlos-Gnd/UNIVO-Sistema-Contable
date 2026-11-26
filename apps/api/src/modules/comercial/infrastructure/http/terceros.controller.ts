import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  crearTerceroSchema,
  editarTerceroSchema,
  rolTerceroSchema,
  type TerceroVista,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosTercero } from "../../application/casos-tercero.js";
import {
  ReglaComercialError,
  TerceroDuplicadoError,
  TerceroNoEncontradoError,
} from "../../domain/tercero.js";

const PERMISO_VER = "terceros.ver";
const PERMISO_REGISTRAR = "terceros.registrar";

/** Traduce los errores del dominio comercial a respuestas HTTP. */
export function aHttp(e: unknown): never {
  if (e instanceof TerceroNoEncontradoError) throw new NotFoundException(e.message);
  if (e instanceof TerceroDuplicadoError) throw new ConflictException(e.message);
  if (e instanceof ReglaComercialError) throw new UnprocessableEntityException(e.message);
  throw e;
}

/** Clientes y proveedores de una empresa (HU-58). No hay DELETE: un tercero se inactiva y conserva su historial. */
@Controller("empresas/:empresaId/terceros")
export class TercerosController {
  constructor(private readonly casos: CasosTercero) {}

  /** Filtros opcionales: ?rol=cliente|proveedor, ?busqueda (nombre, NIT o NRC) y ?activo=true|false. */
  @Get()
  @Permiso(PERMISO_VER)
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query("rol") rol?: string,
    @Query("busqueda") busqueda?: string,
    @Query("activo") activo?: string,
  ): Promise<TerceroVista[]> {
    const filtro = {
      ...(rol ? { rol: validar(rolTerceroSchema, rol) } : {}),
      ...(busqueda ? { busqueda } : {}),
      ...(activo === "true" ? { activo: true } : activo === "false" ? { activo: false } : {}),
    };
    return this.casos.lista(usuario.id, empresaId, filtro).catch(aHttp);
  }

  @Get(":terceroId")
  @Permiso(PERMISO_VER)
  uno(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("terceroId", ParseUUIDPipe) terceroId: string,
  ): Promise<TerceroVista> {
    return this.casos.uno(usuario.id, empresaId, terceroId).catch(aHttp);
  }

  @Post()
  @Permiso(PERMISO_REGISTRAR)
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<TerceroVista> {
    return this.casos.crear(usuario.id, empresaId, validar(crearTerceroSchema, cuerpo)).catch(aHttp);
  }

  @Patch(":terceroId")
  @Permiso(PERMISO_REGISTRAR)
  editar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("terceroId", ParseUUIDPipe) terceroId: string,
    @Body() cuerpo: unknown,
  ): Promise<TerceroVista> {
    return this.casos
      .editar(usuario.id, empresaId, terceroId, validar(editarTerceroSchema, cuerpo))
      .catch(aHttp);
  }
}
