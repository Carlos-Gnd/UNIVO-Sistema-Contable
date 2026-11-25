import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from "@nestjs/common";
import { editarParametrosSchema, type ParametrosEmpresa } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarParametros, EditarParametrosCaso } from "../../application/casos-parametros.js";
import { aHttp } from "./errores-http.js";
import { AutorizaEnCasoDeUso } from "../../../../compartido/permiso.decorator.js";

/** Parámetros contables de la empresa (HU-12, S2-T02). */
@Controller("empresas/:empresaId/parametros")
export class ParametrosController {
  constructor(
    private readonly consultar: ConsultarParametros,
    private readonly editar: EditarParametrosCaso,
  ) {}

  /** Valores actuales y qué parámetros están bloqueados por haber movimientos. Requiere empresa.ver. */
  @AutorizaEnCasoDeUso("El caso de uso valida el permiso de configuración de la empresa.")
  @Get()
  obtener(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<ParametrosEmpresa> {
    return this.consultar.ejecutar(usuario.id, empresaId).catch(aHttp);
  }

  /** Cambia solo los parámetros enviados; 422 si alguno está bloqueado. Requiere empresa.configurar. */
  @AutorizaEnCasoDeUso("El caso de uso valida el permiso de configuración de la empresa.")
  @Patch()
  actualizar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ParametrosEmpresa> {
    const cambios = validar(editarParametrosSchema, cuerpo);
    return this.editar.ejecutar(usuario.id, empresaId, cambios).catch(aHttp);
  }
}
