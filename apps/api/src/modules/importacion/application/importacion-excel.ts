import { Inject, Injectable } from "@nestjs/common";
import type { ReporteImportacion, TipoImportacion } from "@contable/shared";
import {
  EmpresaNoEncontradaError,
  LIBROS_EXCEL,
  PERMISO_IMPORTAR,
  PLANTILLAS,
  REPOSITORIO_IMPORTACION,
  SinPermisoImportarError,
  type LibrosExcel,
  type RepositorioImportacion,
} from "../domain/plantillas.js";
import { validarCatalogo, validarSaldos } from "../domain/validacion.js";

export interface ArchivoExcel {
  nombre: string;
  contenido: Buffer;
}

/**
 * Importación desde Excel (HU-17): descarga de plantillas (S1-T68) y lectura con validación por fila
 * (S1-T69). Validar no guarda nada; la carga usa las filas del reporte solo si no tiene errores (la partida
 * de apertura a partir de los saldos es S1-T70).
 */
@Injectable()
export class ImportacionExcel {
  constructor(
    @Inject(REPOSITORIO_IMPORTACION) private readonly repositorio: RepositorioImportacion,
    @Inject(LIBROS_EXCEL) private readonly libros: LibrosExcel,
  ) {}

  private async exigirPermiso(usuarioId: string, empresaId: string) {
    const permisos = await this.repositorio.permisos(usuarioId, empresaId);
    if (!permisos) throw new EmpresaNoEncontradaError();
    if (!permisos.has(PERMISO_IMPORTAR)) throw new SinPermisoImportarError();
  }

  async plantilla(usuarioId: string, empresaId: string, tipo: TipoImportacion): Promise<ArchivoExcel> {
    await this.exigirPermiso(usuarioId, empresaId);
    const plantilla = PLANTILLAS[tipo];
    const contenido =
      tipo === "catalogo"
        ? await this.libros.plantillaCatalogo(plantilla)
        : await this.libros.plantillaSaldos(plantilla, await this.repositorio.cuentas(empresaId));
    return { nombre: plantilla.archivo, contenido };
  }

  async validar(
    usuarioId: string,
    empresaId: string,
    tipo: TipoImportacion,
    archivo: Buffer,
  ): Promise<ReporteImportacion> {
    await this.exigirPermiso(usuarioId, empresaId);
    const hoja = await this.libros.leerHoja(archivo, PLANTILLAS[tipo]);
    const cuentas = await this.repositorio.cuentas(empresaId);
    return tipo === "catalogo" ? validarCatalogo(hoja, cuentas) : validarSaldos(hoja, cuentas);
  }
}
