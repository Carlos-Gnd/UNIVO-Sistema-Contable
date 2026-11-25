import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from "@nestjs/common";
import { asignarRolUsuarioSchema, type MiembroEmpresa } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { AsignarRolUsuario } from "../../application/casos-asignacion-usuario.js";
import { ListarUsuariosEmpresa } from "../../application/listar-usuarios.js";
import { AutorizaEnCasoDeUso } from "../../../../compartido/permiso.decorator.js";

@Controller("empresas/:empresaId/usuarios")
export class AsignacionUsuarioController {
  constructor(
    private readonly asignarRol: AsignarRolUsuario,
    private readonly listarUsuarios: ListarUsuariosEmpresa,
  ) {}

  /** Usuarios de la empresa con su rol y sucursales; requiere usuarios.gestionar. */
  @AutorizaEnCasoDeUso("El caso de uso valida usuarios.gestionar.")
  @Get()
  listar(
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @UsuarioActual() usuario: Usuario,
  ): Promise<MiembroEmpresa[]> {
    return this.listarUsuarios.ejecutar(empresaId, usuario.id);
  }

  @AutorizaEnCasoDeUso("El caso de uso valida usuarios.gestionar.")
  @Patch(":usuarioId")
  asignar(
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("usuarioId", ParseUUIDPipe) usuarioId: string,
    @UsuarioActual() usuario: Usuario,
    @Body() cuerpo: unknown,
  ): Promise<{ mensaje: string }> {
    const datos = validar(asignarRolUsuarioSchema, cuerpo);
    return this.asignarRol.ejecutar(empresaId, usuarioId, usuario.id, datos);
  }
}
