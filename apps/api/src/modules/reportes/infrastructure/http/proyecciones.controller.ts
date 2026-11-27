import {
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnprocessableEntityException,
  Body,
} from "@nestjs/common";
import { z } from "zod";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ProyectarEstados } from "../../application/proyectar-estados.js";
import { EmpresaNoEncontradaError, SinPermisoReportesError } from "../../domain/balanza.js";
import {
  ProyeccionFueraDeRangoError,
  SinHistorialProyeccionError,
  type SupuestosProyeccion,
} from "../../domain/proyecciones.js";

const supuestosProyeccionSchema = z.object({
  meses: z.number().int().min(1).max(24),
  crecimientoVentasMensual: z.number().min(-100).max(1000),
  crecimientoGastosMensual: z.number().min(-100).max(1000),
});

function aHttp(error: unknown): never {
  if (error instanceof EmpresaNoEncontradaError) throw new NotFoundException(error.message);
  if (error instanceof SinPermisoReportesError) throw new ForbiddenException(error.message);
  if (error instanceof SinHistorialProyeccionError || error instanceof ProyeccionFueraDeRangoError) {
    throw new UnprocessableEntityException(error.message);
  }
  throw error;
}

/** Proyección informativa de ventas, gastos, utilidad, flujo e IVA; no genera partidas (HU-85, S4-T25). */
@Controller("empresas/:empresaId/estados/proyecciones")
export class ProyeccionesController {
  constructor(private readonly proyectar: ProyectarEstados) {}

  @Post()
  @Permiso("analitica.ver")
  calcular(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ) {
    const supuestos = validar(supuestosProyeccionSchema, cuerpo) as SupuestosProyeccion;
    return this.proyectar.ejecutar(usuario.id, empresaId, supuestos).catch(aHttp);
  }
}
