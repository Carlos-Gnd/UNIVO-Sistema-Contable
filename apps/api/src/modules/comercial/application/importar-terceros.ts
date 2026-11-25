import { Inject, Injectable } from "@nestjs/common";
import {
  MAXIMO_FILAS_IMPORTACION,
  type ReporteImportacionTerceros,
  type ResultadoImportacionTerceros,
} from "@contable/shared";
import { leerHoja } from "../../importacion/infrastructure/excel.js";
import { PLANTILLA_TERCEROS, validarTerceros } from "../domain/importacion-terceros.js";
import { REPOSITORIO_COMERCIAL, type RepositorioComercial, type UnidadComercial } from "../domain/tercero.js";
import { plantillaTerceros } from "../infrastructure/excel-terceros.js";

/**
 * Importación de clientes y proveedores desde Excel (HU-58), con el patrón de la de productos (HU-64). El
 * permiso terceros.registrar lo exige el controlador. Validar no guarda nada; cargar crea todos o ninguno.
 */
@Injectable()
export class ImportarTerceros {
  constructor(@Inject(REPOSITORIO_COMERCIAL) private readonly repositorio: RepositorioComercial) {}

  async plantilla(): Promise<{ nombre: string; contenido: Buffer }> {
    return { nombre: PLANTILLA_TERCEROS.archivo, contenido: await plantillaTerceros() };
  }

  private async reporte(
    unidad: UnidadComercial,
    empresaId: string,
    archivo: Buffer,
  ): Promise<ReporteImportacionTerceros> {
    const hoja = await leerHoja(archivo, PLANTILLA_TERCEROS);
    const existentes = await unidad.terceros(empresaId, {});
    return validarTerceros(hoja, existentes, MAXIMO_FILAS_IMPORTACION);
  }

  validar(usuarioId: string, empresaId: string, archivo: Buffer): Promise<ReporteImportacionTerceros> {
    return this.repositorio.enTransaccion(usuarioId, (u) => this.reporte(u, empresaId, archivo));
  }

  cargar(usuarioId: string, empresaId: string, archivo: Buffer): Promise<ResultadoImportacionTerceros> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const reporte = await this.reporte(u, empresaId, archivo);
      if (!reporte.valido) return { reporte, creados: 0 };
      for (const f of reporte.filas) {
        await u.crearTercero(empresaId, {
          nombre: f.nombre,
          nit: f.nit,
          nrc: f.nrc ?? undefined,
          actividadEconomica: f.actividadEconomica ?? undefined,
          clasificacion: f.clasificacion,
          direccion: f.direccion ?? undefined,
          telefono: f.telefono ?? undefined,
          correo: f.correo ?? undefined,
          esCliente: f.esCliente,
          esProveedor: f.esProveedor,
          diasCredito: f.diasCredito,
        });
      }
      return { reporte, creados: reporte.filas.length };
    });
  }
}
