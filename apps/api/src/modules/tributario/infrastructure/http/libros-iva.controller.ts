import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { consultaLibroIvaSchema, type LibroCompras, type LibroContribuyentes } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { lanzarErrorReporte } from "../../../reportes/infrastructure/http/error-reporte.js";
import { ConsultarLibrosIva, PERMISO_LIBROS_IVA } from "../../application/consultar-libros-iva.js";

/**
 * Libros de IVA del Art. 141 del Código Tributario. Query común: desde y hasta (AAAA-MM-DD, dentro de un mismo
 * ejercicio) y sucursalId (sin ella, consolidado de las sucursales a las que el usuario tiene acceso).
 */
@Controller("empresas/:empresaId/libros-iva")
export class LibrosIvaController {
  constructor(private readonly consultar: ConsultarLibrosIva) {}

  /** Libro de compras (HU-45): los CCF y facturas de proveedores con su crédito fiscal. */
  @Get("compras")
  @Permiso(PERMISO_LIBROS_IVA.codigo)
  async compras(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<LibroCompras> {
    const consulta = validar(consultaLibroIvaSchema, query);
    try {
      return await this.consultar.compras(usuario.id, empresaId, consulta);
    } catch (e) {
      return lanzarErrorReporte(e);
    }
  }

  /** Libro de ventas a contribuyentes (HU-46): los CCF emitidos con su débito fiscal. */
  @Get("contribuyentes")
  @Permiso(PERMISO_LIBROS_IVA.codigo)
  async contribuyentes(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() query: unknown,
  ): Promise<LibroContribuyentes> {
    const consulta = validar(consultaLibroIvaSchema, query);
    try {
      return await this.consultar.contribuyentes(usuario.id, empresaId, consulta);
    } catch (e) {
      return lanzarErrorReporte(e);
    }
  }
}
