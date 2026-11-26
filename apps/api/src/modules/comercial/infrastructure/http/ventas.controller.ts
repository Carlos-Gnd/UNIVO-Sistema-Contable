import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  consultaDocumentosSchema,
  crearVentaSchema,
  type DocumentoComercialResumen,
  type DocumentoComercialVista,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosDocumento } from "../../application/casos-documento.js";
import { aHttpDocumento } from "./errores-http.js";

const PERMISO_VER = "operaciones.ver";
const PERMISO_REGISTRAR = "operaciones.registrar";

/** Ventas de una empresa (HU-60): cada registro saca del kardex y genera las partidas de venta y de costo. */
@Controller("empresas/:empresaId/ventas")
export class VentasController {
  constructor(private readonly casos: CasosDocumento) {}

  /** Filtros opcionales: ?desde y ?hasta (AAAA-MM-DD), ?terceroId y ?busqueda (número o cliente). */
  @Get()
  @Permiso(PERMISO_VER)
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: Record<string, unknown>,
  ): Promise<DocumentoComercialResumen[]> {
    return this.casos
      .listar(usuario.id, empresaId, "venta", validar(consultaDocumentosSchema, consulta))
      .catch(aHttpDocumento);
  }

  @Get(":documentoId")
  @Permiso(PERMISO_VER)
  uno(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("documentoId", ParseUUIDPipe) documentoId: string,
  ): Promise<DocumentoComercialVista> {
    return this.casos.ver(usuario.id, empresaId, "venta", documentoId).catch(aHttpDocumento);
  }

  @Post()
  @Permiso(PERMISO_REGISTRAR)
  registrar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<DocumentoComercialVista> {
    return this.casos
      .registrarVenta(usuario.id, empresaId, validar(crearVentaSchema, cuerpo))
      .catch(aHttpDocumento);
  }
}
