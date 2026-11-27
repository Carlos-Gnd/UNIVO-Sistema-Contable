import { Body, Controller, Get, Patch } from "@nestjs/common";
import { modoDidacticoSchema } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { AutorizaEnCasoDeUso } from "../../../../compartido/permiso.decorator.js";
import { PreferenciaModoDidactico } from "../../application/preferencia-modo-didactico.js";

/** Preferencia de explicaciones contables del perfil autenticado. */
@Controller("usuarios/me/modo-didactico")
export class PreferenciaModoDidacticoController {
  constructor(private readonly preferencia: PreferenciaModoDidactico) {}

  @AutorizaEnCasoDeUso("El usuario solo puede consultar su propio perfil autenticado.")
  @Get()
  consultar(@UsuarioActual() usuario: Usuario): Promise<{ activo: boolean }> {
    return this.preferencia.consultar(usuario.id);
  }

  @AutorizaEnCasoDeUso("El usuario solo puede actualizar su propio perfil autenticado.")
  @Patch()
  actualizar(@UsuarioActual() usuario: Usuario, @Body() cuerpo: unknown): Promise<{ activo: boolean }> {
    const { activo } = validar(modoDidacticoSchema, cuerpo);
    return this.preferencia.actualizar(usuario.id, activo);
  }
}
