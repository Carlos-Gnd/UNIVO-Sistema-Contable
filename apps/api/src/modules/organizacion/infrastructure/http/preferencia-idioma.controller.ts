import { Body, Controller, Get, Patch } from "@nestjs/common";
import { preferenciaIdiomaSchema } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { AutorizaEnCasoDeUso } from "../../../../compartido/permiso.decorator.js";
import { PreferenciaIdiomaUsuario } from "../../application/preferencia-idioma.js";

/** Preferencia de idioma del perfil; no recibe identificadores de usuario desde el cliente. */
@Controller("usuarios/me/idioma")
export class PreferenciaIdiomaController {
  constructor(private readonly preferencia: PreferenciaIdiomaUsuario) {}

  @AutorizaEnCasoDeUso("El usuario solo puede consultar su propio perfil autenticado.")
  @Get()
  consultar(@UsuarioActual() usuario: Usuario): Promise<{ idioma: string }> {
    return this.preferencia.consultar(usuario.id);
  }

  @AutorizaEnCasoDeUso("El usuario solo puede actualizar su propio perfil autenticado.")
  @Patch()
  actualizar(@UsuarioActual() usuario: Usuario, @Body() cuerpo: unknown): Promise<{ idioma: string }> {
    const { idioma } = validar(preferenciaIdiomaSchema, cuerpo);
    return this.preferencia.actualizar(usuario.id, idioma);
  }
}
