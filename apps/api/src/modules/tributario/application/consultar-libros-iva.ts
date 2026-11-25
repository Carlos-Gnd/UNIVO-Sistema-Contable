import { Inject, Injectable } from "@nestjs/common";
import type { ConsultaLibroIva, LibroCompras, LibroContribuyentes } from "@contable/shared";
import { alcanceDelReporte } from "../../reportes/application/alcance-reporte.js";
import { SinPermisoReportesError } from "../../reportes/domain/balanza.js";
import { armarLibroCompras, armarLibroContribuyentes } from "../domain/libros-iva.js";
import { REPOSITORIO_LIBROS_IVA, type RepositorioLibrosIva } from "../domain/repositorio-libros-iva.js";

/** Permiso de los libros de IVA. */
export const PERMISO_LIBROS_IVA = {
  codigo: "iva.ver",
  error: () => new SinPermisoReportesError("Su rol no permite consultar los libros de IVA en esta empresa."),
};

/**
 * Casos de uso de los libros de IVA (Art. 141 del Código Tributario): leen los documentos que registran
 * compras y ventas, con partidas contabilizadas o anuladas, y arman cada libro con totales exactos.
 */
@Injectable()
export class ConsultarLibrosIva {
  constructor(@Inject(REPOSITORIO_LIBROS_IVA) private readonly repositorio: RepositorioLibrosIva) {}

  /** Libro de compras del período (HU-45). */
  compras(usuarioId: string, empresaId: string, consulta: ConsultaLibroIva): Promise<LibroCompras> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const { sucursales } = await alcanceDelReporte(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_LIBROS_IVA,
        consulta,
      );
      const documentos = await unidad.documentosDelLibro({
        empresaId,
        operacion: "compra",
        tipos: ["ccf", "factura"],
        desde: consulta.desde,
        hasta: consulta.hasta,
        sucursales,
      });
      return armarLibroCompras(consulta, documentos);
    });
  }

  /** Libro de ventas a contribuyentes del período (HU-46): los CCF emitidos. */
  contribuyentes(
    usuarioId: string,
    empresaId: string,
    consulta: ConsultaLibroIva,
  ): Promise<LibroContribuyentes> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const { sucursales } = await alcanceDelReporte(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_LIBROS_IVA,
        consulta,
      );
      const documentos = await unidad.documentosDelLibro({
        empresaId,
        operacion: "venta",
        tipos: ["ccf"],
        desde: consulta.desde,
        hasta: consulta.hasta,
        sucursales,
      });
      return armarLibroContribuyentes(consulta, documentos);
    });
  }
}
