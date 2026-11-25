import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { crearEmpresaSchema, editarEmpresaSchema, type EmpresaDetalle } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import {
  ConsultarEmpresa,
  EditarEmpresaCaso,
  ListarEmpresasDisponibles,
  RegistrarEmpresa,
} from "../../application/casos-empresa.js";
import { ConsultarMisPermisos } from "../../application/consultar-mis-permisos.js";
import type { PermisosUsuarioEmpresa } from "../../domain/repositorio-empresas.js";
import { aHttp } from "./errores-http.js";
import { AutorizaEnCasoDeUso } from "../../../../compartido/permiso.decorator.js";

@Controller("empresas")
export class EmpresasController {
  constructor(
    private readonly registrar: RegistrarEmpresa,
    private readonly consultar: ConsultarEmpresa,
    private readonly editar: EditarEmpresaCaso,
    private readonly consultarMisPermisos: ConsultarMisPermisos,
    private readonly listarDisponibles: ListarEmpresasDisponibles,
  ) {}

  /**
   * Registra una empresa con su casa matriz y su catálogo; quien la crea queda como su administrador
   * (S1-T38, S1-T39, S1-T44, S1-T67).
   */
  @AutorizaEnCasoDeUso("Cualquier usuario autenticado puede crear su propia empresa.")
  @Post()
  crear(@UsuarioActual() usuario: Usuario, @Body() cuerpo: unknown): Promise<EmpresaDetalle> {
    const datos = validar(crearEmpresaSchema, cuerpo);
    return this.registrar.ejecutar(usuario, datos).catch(aHttp);
  }

  /** Empresas activas del usuario autenticado para el selector del encabezado (S1-T51). */
  @AutorizaEnCasoDeUso("Solo lista las empresas de las que el usuario es miembro.")
  @Get("disponibles")
  disponibles(@UsuarioActual() usuario: Usuario) {
    return this.listarDisponibles.ejecutar(usuario.id);
  }

  @AutorizaEnCasoDeUso("El caso de uso valida la membresía y el permiso del usuario en la empresa.")
  @Get(":empresaId")
  obtener(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<EmpresaDetalle> {
    return this.consultar.ejecutar(usuario.id, empresaId).catch(aHttp);
  }

  /** Devuelve el rol, permisos y sucursales visibles del usuario actual (S1-T55). */
  @AutorizaEnCasoDeUso("El caso de uso valida la membresía y el permiso del usuario en la empresa.")
  @Get(":empresaId/mis-permisos")
  misPermisos(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<PermisosUsuarioEmpresa> {
    return this.consultarMisPermisos.ejecutar(usuario.id, empresaId).catch(aHttp);
  }

  /** Edita solo los campos enviados (S1-T38). */
  @AutorizaEnCasoDeUso("El caso de uso valida la membresía y el permiso del usuario en la empresa.")
  @Patch(":empresaId")
  actualizar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<EmpresaDetalle> {
    const cambios = validar(editarEmpresaSchema, cuerpo);
    return this.editar.ejecutar(usuario.id, empresaId, cambios).catch(aHttp);
  }
}
