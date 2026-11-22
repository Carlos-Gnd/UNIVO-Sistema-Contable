import type { EstadoResultados } from "@contable/shared";
import { descargarArchivo } from "@/lib/descargas";
import { formatearFecha } from "@/lib/formato";
import { filasEstadoResultados } from "./filas-estado-resultados";
import { TEXTOS_ESTADO_RESULTADOS as T } from "./textos";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FIRMA_REPRESENTANTE = "Representante legal";

export interface DatosExportacionEstado {
  empresa: string;
  alcance: string;
  propietario: string;
  contador: string;
  incluirFirmas: boolean;
}

/** Crea el estado de resultados en XLSX, conservando los montos como celdas numéricas. */
export async function crearExcelEstadoResultados(
  estado: EstadoResultados,
  datos: DatosExportacionEstado,
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  libro.creator = T.exportacion.empresa;

  const hoja = libro.addWorksheet(T.exportacion.nombreHoja, {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  hoja.columns = [{ width: 72 }, { width: 20 }];

  hoja.mergeCells("A1:B1");
  hoja.getCell("A1").value = datos.empresa;
  hoja.getCell("A1").font = { bold: true, size: 15 };
  hoja.getRow(1).height = 26;

  hoja.mergeCells("A2:B2");
  hoja.getCell("A2").value = T.titulo;
  hoja.getCell("A2").font = { bold: true, size: 13 };

  hoja.mergeCells("A3:B3");
  hoja.getCell("A3").value = `${T.exportacion.periodo(
    formatearFecha(estado.desde),
    formatearFecha(estado.hasta),
    datos.alcance,
  )} · ${T.enDolares}`;

  const encabezado = hoja.addRow([T.concepto, T.monto]);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27272A" } };
  encabezado.alignment = { vertical: "middle" };
  encabezado.getCell(2).alignment = { horizontal: "right", vertical: "middle" };

  const filas = filasEstadoResultados(estado);
  for (const filaEstado of filas) {
    const fila = hoja.addRow([
      filaEstado.texto,
      filaEstado.monto === undefined ? null : aNumeroExcel(filaEstado.monto),
    ]);
    fila.alignment = { vertical: "middle" };
    if (filaEstado.tipo === "seccion") {
      fila.font = { bold: true };
      fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
    } else if (filaEstado.tipo === "resultado" || filaEstado.tipo === "total") {
      fila.font = { bold: true };
      fila.border = { top: { style: "thin", color: { argb: "FFD4D4D8" } } };
    } else {
      fila.getCell(1).alignment = { indent: 1, vertical: "middle" };
    }
    const monto = fila.getCell(2);
    if (typeof monto.value === "number") {
      monto.numFmt = T.exportacion.formatoNumero;
      monto.alignment = { horizontal: "right", vertical: "middle" };
    }
  }

  if (datos.incluirFirmas) agregarFirmas(hoja, datos.propietario, datos.contador);

  hoja.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: Math.max(4, 4 + filas.length), column: 2 },
  };

  const archivo = await libro.xlsx.writeBuffer();
  return new Blob([archivo], { type: TIPO_XLSX });
}

export function descargarExcelEstadoResultados(
  archivo: Blob,
  estado: Pick<EstadoResultados, "desde" | "hasta">,
): void {
  descargarArchivo(archivo, `${T.exportacion.archivoExcel}-${estado.desde}-${estado.hasta}.xlsx`);
}

function agregarFirmas(hoja: import("exceljs").Worksheet, propietario: string, contador: string): void {
  hoja.addRow([]);
  const espacio = hoja.addRow([null, null]);
  espacio.height = 28;
  const firmas = hoja.addRow([propietario.trim() || "", contador.trim() || ""]);
  firmas.font = { bold: true };
  firmas.alignment = { horizontal: "center", vertical: "middle" };
  firmas.getCell(1).border = { top: { style: "thin", color: { argb: "FF52525B" } } };
  firmas.getCell(2).border = { top: { style: "thin", color: { argb: "FF52525B" } } };
  const cargos = hoja.addRow([FIRMA_REPRESENTANTE, T.exportacion.contador]);
  cargos.font = { size: 9, color: { argb: "FF71717A" } };
  cargos.alignment = { horizontal: "center" };
}

function aNumeroExcel(monto: string): number {
  // La conversión solo se usa para celdas numéricas de Excel; el dominio mantiene montos decimales como texto.
  const numero = Number(monto);
  return Number.isFinite(numero) ? numero : 0;
}
