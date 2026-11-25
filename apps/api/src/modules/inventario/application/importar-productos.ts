import { Inject, Injectable } from "@nestjs/common";
import {
  MAXIMO_FILAS_IMPORTACION,
  type ReporteImportacionProductos,
  type ResultadoImportacionProductos,
} from "@contable/shared";
import { leerHoja } from "../../importacion/infrastructure/excel.js";
import { PLANTILLA_PRODUCTOS, validarProductos } from "../domain/importacion-productos.js";
import {
  REPOSITORIO_INVENTARIO,
  type RepositorioInventario,
  type UnidadInventario,
} from "../domain/producto.js";
import { plantillaProductos } from "../infrastructure/excel-productos.js";

/**
 * Importación de productos desde Excel (HU-64). El permiso inventario.registrar lo exige el controlador.
 * Validar no guarda nada; cargar crea todos los productos en una sola transacción o ninguno.
 */
@Injectable()
export class ImportarProductos {
  constructor(@Inject(REPOSITORIO_INVENTARIO) private readonly repositorio: RepositorioInventario) {}

  plantilla(usuarioId: string, empresaId: string): Promise<{ nombre: string; contenido: Buffer }> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const categorias = (await u.categorias(empresaId)).filter((c) => c.activa).map((c) => c.nombre);
      return { nombre: PLANTILLA_PRODUCTOS.archivo, contenido: await plantillaProductos(categorias) };
    });
  }

  private async reporte(
    unidad: UnidadInventario,
    empresaId: string,
    archivo: Buffer,
  ): Promise<ReporteImportacionProductos> {
    const hoja = await leerHoja(archivo, PLANTILLA_PRODUCTOS);
    const [categorias, productos] = await Promise.all([
      unidad.categorias(empresaId),
      unidad.productos(empresaId, {}),
    ]);
    return validarProductos(
      hoja,
      categorias,
      new Set(productos.map((p) => p.codigo.toLowerCase())),
      MAXIMO_FILAS_IMPORTACION,
    );
  }

  validar(usuarioId: string, empresaId: string, archivo: Buffer): Promise<ReporteImportacionProductos> {
    return this.repositorio.enTransaccion(usuarioId, (u) => this.reporte(u, empresaId, archivo));
  }

  cargar(usuarioId: string, empresaId: string, archivo: Buffer): Promise<ResultadoImportacionProductos> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const reporte = await this.reporte(u, empresaId, archivo);
      if (!reporte.valido) return { reporte, creados: 0 };
      for (const f of reporte.filas) {
        await u.crearProducto(empresaId, {
          codigo: f.codigo,
          nombre: f.nombre,
          categoriaId: f.categoriaId ?? undefined,
          unidadMedida: f.unidadMedida ?? undefined,
          precioVenta: f.precioVenta,
          existenciaMinima: f.existenciaMinima,
          controlaSeries: f.controlaSeries,
          metodoValuacion: f.metodoValuacion ?? undefined,
        });
      }
      return { reporte, creados: reporte.filas.length };
    });
  }
}
