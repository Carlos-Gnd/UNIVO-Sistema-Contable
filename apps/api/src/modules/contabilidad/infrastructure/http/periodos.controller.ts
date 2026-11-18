import { Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { AdministrarEjercicios } from "../../application/administrar-ejercicios.js";

@Controller("empresas/:empresaId/periodos")
export class PeriodosController {
  constructor(private readonly ejercicios: AdministrarEjercicios) {}

  /** Cierra un período; responde 409 con los borradores que impiden el cierre. */
  @Post(":periodoId/cerrar")
  @Permiso("periodos.cerrar")
  cerrar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("periodoId", ParseUUIDPipe) periodoId: string,
  ) {
    return this.ejercicios.cerrarPeriodo(usuario.id, empresaId, periodoId);
  }
}
