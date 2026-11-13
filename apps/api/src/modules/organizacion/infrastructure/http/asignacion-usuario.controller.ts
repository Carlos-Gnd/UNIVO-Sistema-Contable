import { Body, Controller, Param, ParseUUIDPipe, Patch } from "@nestjs/common";
import { asignarRolUsuarioSchema } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { AsignarRolUsuario } from "../../application/casos-asignacion-usuario.js";

@Controller("empresas/:empresaId/usuarios")
export class AsignacionUsuarioController {
  constructor(private readonly asignarRol: AsignarRolUsuario) {}

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
