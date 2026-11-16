import {
  MAXIMO_BYTES_IMPORTACION,
  type ProblemaImportacion,
  type ReporteImportacion,
  type TipoImportacion,
} from "@contable/shared";
import type { TFunction } from "i18next";

const MEGA = 1024 * 1024;
export const MAXIMO_MEGAS = MAXIMO_BYTES_IMPORTACION / MEGA;

const megas = (bytes: number) => (bytes / MEGA).toFixed(1).replace(/\.0$/, "");

/** Revisión rápida antes de subir: que sea un .xlsx y que no pase de 5 MB. Devuelve el error o null. */
export function revisarArchivo(archivo: File, t: TFunction<"importacion">): string | null {
  if (!/\.xlsx$/i.test(archivo.name)) return t("archivo.noEsExcel");
  if (archivo.size > MAXIMO_BYTES_IMPORTACION)
    return t("archivo.muyGrande", { megas: megas(archivo.size), maximo: MAXIMO_MEGAS });
  return null;
}

/** Tamaño para mostrar junto al nombre del archivo, en KB (al menos 1). */
export const kilobytes = (bytes: number) => Math.max(1, Math.round(bytes / 1024));

/** Filas distintas con errores; los errores de todo el archivo (sin fila) no cuentan. */
export const filasConErrores = (reporte: ReporteImportacion) =>
  new Set(reporte.errores.map((e) => e.fila).filter((f) => f !== null)).size;

/** Errores primero por número de fila; los de todo el archivo, al inicio. */
export const ordenarProblemas = (problemas: readonly ProblemaImportacion[]) =>
  [...problemas].sort((a, b) => (a.fila ?? 0) - (b.fila ?? 0));

/**
 * Reporte de errores en Excel para corregir el archivo: fila, columna y qué corregir (S1-T71).
 * ExcelJS se descarga solo al pedir el reporte.
 */
export async function crearReporteErrores(
  reporte: ReporteImportacion,
  t: TFunction<"importacion">,
): Promise<{ contenido: Blob; nombre: string }> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(t("reporte.hoja"), { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = [
    { header: t("validacion.fila"), width: 10 },
    { header: t("validacion.columna"), width: 22 },
    { header: t("validacion.mensaje"), width: 80 },
  ];
  hoja.getRow(1).font = { bold: true };
  for (const error of ordenarProblemas(reporte.errores)) {
    hoja.addRow([error.fila ?? t("validacion.todoElArchivo"), error.columna ?? "", error.mensaje]);
  }
  const contenido = await libro.xlsx.writeBuffer();
  return {
    contenido: new Blob([contenido], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    nombre: `${t("reporte.archivo", { tipo: reporte.tipo as TipoImportacion })}.xlsx`,
  };
}
