import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  consultaNotasSchema,
  crearNotaSchema,
  operacionComercialSchema,
  type DisponibleNota,
  type NotaComercialResumen,
  type NotaComercialVista,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosNota } from "../../application/casos-nota.js";
import { aHttpDocumento } from "./errores-http.js";

const PERMISO_VER = "operaciones.ver";
const PERMISO_REGISTRAR = "operaciones.registrar";

/** Devoluciones y rebajas (HU-61): notas de crédito y de débito sobre compras y ventas. */
@Controller("empresas/:empresaId/notas-comerciales")
export class NotasController {
  constructor(private readonly casos: CasosNota) {}

  /** ?operacion=compra|venta (obligatorio) y filtros opcionales ?desde, ?hasta, ?documentoId y ?busqueda. */
  @Get()
  @Permiso(PERMISO_VER)
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: Record<string, unknown>,
  ): Promise<NotaComercialResumen[]> {
    return this.casos
      .listar(usuario.id, empresaId, validar(consultaNotasSchema, consulta))
      .catch(aHttpDocumento);
  }

  /** Unidades e importe que quedan por devolver o rebajar de cada línea del documento. */
  @Get("disponible/:operacion/:documentoId")
  @Permiso(PERMISO_VER)
  disponible(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("operacion") operacion: string,
    @Param("documentoId", ParseUUIDPipe) documentoId: string,
  ): Promise<DisponibleNota> {
    return this.casos
      .disponible(usuario.id, empresaId, validar(operacionComercialSchema, operacion), documentoId)
      .catch(aHttpDocumento);
  }

  @Get(":notaId")
  @Permiso(PERMISO_VER)
  una(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("notaId", ParseUUIDPipe) notaId: string,
  ): Promise<NotaComercialVista> {
    return this.casos.ver(usuario.id, empresaId, notaId).catch(aHttpDocumento);
  }

  @Post()
  @Permiso(PERMISO_REGISTRAR)
  registrar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<NotaComercialVista> {
    return this.casos
      .registrar(usuario.id, empresaId, validar(crearNotaSchema, cuerpo))
      .catch(aHttpDocumento);
  }
}
