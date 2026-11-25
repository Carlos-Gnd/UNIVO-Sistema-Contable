import { Body, Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { invitarUsuarioSchema } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../compartido/usuario-actual.js";
import { validar } from "../../compartido/validacion.js";
import { InvitacionService } from "./invitacion.service.js";
import { AutorizaEnCasoDeUso } from "../../compartido/permiso.decorator.js";

@Controller("empresas/:empresaId/usuarios/invitaciones")
export class InvitacionController {
  constructor(private readonly invitacionService: InvitacionService) {}

  @AutorizaEnCasoDeUso("El caso de uso valida usuarios.gestionar.")
  @Post()
  invitar(
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @UsuarioActual() usuario: Usuario,
    @Body() cuerpo: unknown,
  ): Promise<{ mensaje: string }> {
    const datos = validar(invitarUsuarioSchema, cuerpo);
    return this.invitacionService.invitar(empresaId, usuario.id, datos);
  }
}
