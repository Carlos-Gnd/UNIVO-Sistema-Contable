import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { crearSucursalSchema, editarSucursalSchema, type SucursalDetalle } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { EditarSucursalCaso, ListarSucursales, RegistrarSucursal } from "../../application/casos-sucursal.js";
import { aHttp } from "./errores-http.js";

/** Sucursales de una empresa (HU-07, S1-T43). No hay DELETE: una sucursal se inactiva. */
@Controller("empresas/:empresaId/sucursales")
export class SucursalesController {
  constructor(
    private readonly listar: ListarSucursales,
    private readonly registrar: RegistrarSucursal,
    private readonly editar: EditarSucursalCaso,
  ) {}

  @Get()
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<SucursalDetalle[]> {
    return this.listar.ejecutar(usuario.id, empresaId).catch(aHttp);
  }

  @Post()
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<SucursalDetalle> {
    const datos = validar(crearSucursalSchema, cuerpo);
    return this.registrar.ejecutar(usuario.id, empresaId, datos).catch(aHttp);
  }

  /** Edita los campos enviados; { "activa": false } la inactiva y { "activa": true } la reactiva. */
  @Patch(":sucursalId")
  actualizar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("sucursalId", ParseUUIDPipe) sucursalId: string,
    @Body() cuerpo: unknown,
  ): Promise<SucursalDetalle> {
    const cambios = validar(editarSucursalSchema, cuerpo);
    return this.editar.ejecutar(usuario.id, empresaId, sucursalId, cambios).catch(aHttp);
  }
}
