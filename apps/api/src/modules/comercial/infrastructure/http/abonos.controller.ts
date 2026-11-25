import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  consultaAbonosSchema,
  consultaPendientesSchema,
  crearAbonoSchema,
  type AbonoResumen,
  type AbonoVista,
  type DocumentoPendiente,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosAbono } from "../../application/casos-abono.js";
import { aHttpDocumento } from "./errores-http.js";

const PERMISO_VER = "operaciones.ver";
const PERMISO_REGISTRAR = "operaciones.registrar";

/** Cobros a clientes y pagos a proveedores (HU-62): abonos a documentos al crédito. */
@Controller("empresas/:empresaId/abonos")
export class AbonosController {
  constructor(private readonly casos: CasosAbono) {}

  /** ?operacion=venta|compra (obligatorio) y filtros opcionales ?terceroId, ?desde y ?hasta. */
  @Get()
  @Permiso(PERMISO_VER)
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: Record<string, unknown>,
  ): Promise<AbonoResumen[]> {
    return this.casos
      .listar(usuario.id, empresaId, validar(consultaAbonosSchema, consulta))
      .catch(aHttpDocumento);
  }

  /** Documentos al crédito con saldo: ?operacion (obligatorio), ?terceroId y ?busqueda. */
  @Get("pendientes")
  @Permiso(PERMISO_VER)
  pendientes(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: Record<string, unknown>,
  ): Promise<DocumentoPendiente[]> {
    return this.casos
      .pendientes(usuario.id, empresaId, validar(consultaPendientesSchema, consulta))
      .catch(aHttpDocumento);
  }

  @Get(":abonoId")
  @Permiso(PERMISO_VER)
  uno(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("abonoId", ParseUUIDPipe) abonoId: string,
  ): Promise<AbonoVista> {
    return this.casos.ver(usuario.id, empresaId, abonoId).catch(aHttpDocumento);
  }

  @Post()
  @Permiso(PERMISO_REGISTRAR)
  registrar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<AbonoVista> {
    return this.casos
      .registrar(usuario.id, empresaId, validar(crearAbonoSchema, cuerpo))
      .catch(aHttpDocumento);
  }
}
