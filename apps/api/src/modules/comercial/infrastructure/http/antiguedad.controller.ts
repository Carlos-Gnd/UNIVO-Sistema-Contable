import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { consultaAntiguedadSchema, type AntiguedadSaldos } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosAntiguedad } from "../../application/casos-antiguedad.js";
import { aHttpDocumento } from "./errores-http.js";

/** Antigüedad de saldos de clientes (venta) y proveedores (compra) a una fecha de corte (HU-63). */
@Controller("empresas/:empresaId/antiguedad-saldos")
export class AntiguedadController {
  constructor(private readonly casos: CasosAntiguedad) {}

  /** ?operacion=venta|compra (obligatorio), ?alFecha=AAAA-MM-DD (por defecto hoy) y ?terceroId. */
  @Get()
  @Permiso("operaciones.ver")
  consultar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: Record<string, unknown>,
  ): Promise<AntiguedadSaldos> {
    return this.casos
      .consultar(usuario.id, empresaId, validar(consultaAntiguedadSchema, consulta))
      .catch(aHttpDocumento);
  }
}
