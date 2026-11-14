import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { crearEjercicioSchema, type CrearEjercicio } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { AdministrarEjercicios } from "../../application/administrar-ejercicios.js";

@Controller("empresas/:empresaId/ejercicios")
export class EjerciciosController {
  constructor(private readonly ejercicios: AdministrarEjercicios) {}

  /** Lista los ejercicios junto con los períodos generados en la base. */
  @Get()
  listar(@UsuarioActual() usuario: Usuario, @Param("empresaId", ParseUUIDPipe) empresaId: string) {
    return this.ejercicios.listar(usuario.id, empresaId);
  }

  /** Crea el ejercicio anual; el trigger de PostgreSQL genera sus doce períodos. */
  @Post()
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ) {
    const datos: CrearEjercicio = validar(crearEjercicioSchema, cuerpo);
    return this.ejercicios.crear(usuario.id, empresaId, datos);
  }
}
