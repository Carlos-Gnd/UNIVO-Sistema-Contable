import { Body, Controller, Param, ParseUUIDPipe, Patch } from "@nestjs/common";
import { asignarRolUsuarioSchema } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../compartido/usuario-actual.js";
import { validar } from "../../compartido/validacion.js";
import { AsignacionUsuarioService } from "./asignacion-usuario.service.js";

@Controller("empresas/:empresaId/usuarios")
export class AsignacionUsuarioController {
  constructor(private readonly asignacionUsuarioService: AsignacionUsuarioService) {}

  @Patch(":usuarioId")
  asignar(
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("usuarioId", ParseUUIDPipe) usuarioId: string,
    @UsuarioActual() usuario: Usuario,
    @Body() cuerpo: unknown,
  ): Promise<{ mensaje: string }> {
    const datos = validar(asignarRolUsuarioSchema, cuerpo);
    return this.asignacionUsuarioService.asignar(empresaId, usuarioId, usuario.id, datos);
  }
}
