import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { crearCuentaSchema, editarCuentaSchema, type CrearCuenta, type EditarCuenta } from "@contable/shared";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { AdministrarCuentas } from "../../application/administrar-cuentas.js";

@Controller("empresas/:empresaId/cuentas")
export class CuentasController {
  constructor(private readonly cuentas: AdministrarCuentas) {}

  /** Lista el catálogo completo de la empresa (S1-T62). */
  @Get()
  listar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ) {
    return this.cuentas.listar(usuario.id, empresaId);
  }

  /** Crea una cuenta; el nivel y el padre los calcula el trigger de PostgreSQL. */
  @Post()
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ) {
    const datos: CrearCuenta = validar(crearCuentaSchema, cuerpo);
    return this.cuentas.crear(usuario.id, empresaId, datos);
  }

  /** Edita los campos enviados sin cambiar el estado activo de la cuenta. */
  @Patch(":cuentaId")
  editar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("cuentaId", ParseUUIDPipe) cuentaId: string,
    @Body() cuerpo: unknown,
  ) {
    const cambios: EditarCuenta = validar(editarCuentaSchema, cuerpo);
    return this.cuentas.editar(usuario.id, empresaId, cuentaId, cambios);
  }

  /** Inactiva una cuenta sin borrar sus movimientos históricos. */
  @Delete(":cuentaId")
  inactivar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("cuentaId", ParseUUIDPipe) cuentaId: string,
  ) {
    return this.cuentas.inactivar(usuario.id, empresaId, cuentaId);
  }
}
