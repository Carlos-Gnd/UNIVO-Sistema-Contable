import type { Balanza } from "@contable/shared";
import { formatearFecha } from "@/lib/formato";
import { TEXTOS_BALANZAS as T } from "./textos";

const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FILA_ENCABEZADO = 6;

export interface DatosBalanzaExportacion {
  empresa: string;
  alcance: string;
}

/** Genera un Excel con los saldos iniciales, movimientos y saldos finales de la balanza consultada. */
export async function crearBalanzaExcel(
  balanza: Balanza,
  datos: DatosBalanzaExportacion,
  ahora: Date = new Date(),
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  libro.creator = "Sistema Contable UNIVO";
  libro.created = ahora;

  const hoja = libro.addWorksheet(T.exportacion.hoja, {
    views: [{ state: "frozen", ySplit: FILA_ENCABEZADO }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  hoja.mergeCells("A1:G1");
  hoja.getCell("A1").value = datos.empresa;
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF18181B" } };
  hoja.getRow(1).height = 28;

  hoja.mergeCells("A2:G2");
  hoja.getCell("A2").value = balanza.titulo;
  hoja.getCell("A2").font = { bold: true, size: 13, color: { argb: "FF18181B" } };

  hoja.mergeCells("A3:G3");
  hoja.getCell("A3").value = T.exportacion.periodo(
    formatearFecha(balanza.desde),
    formatearFecha(balanza.hasta),
    datos.alcance,
  );
  hoja.getCell("A3").font = { size: 10, color: { argb: "FF52525B" } };

  hoja.mergeCells("A4:G4");
  hoja.getCell("A4").value = balanza.cuadra ? T.exportacion.cuadra : T.exportacion.noCuadra;
  hoja.getCell("A4").font = {
    bold: true,
    color: { argb: balanza.cuadra ? "FF166534" : "FFB91C1C" },
  };

  const anchos = [38, 17, 17, 17, 17, 17, 17];
  hoja.columns = anchos.map((width) => ({ width }));
  hoja.mergeCells("B5:C5");
  hoja.mergeCells("D5:E5");
  hoja.mergeCells("F5:G5");
  hoja.getCell("A5").value = T.exportacion.columnas.cuenta;
  hoja.getCell("B5").value = T.exportacion.grupos.saldoInicial;
  hoja.getCell("D5").value = T.exportacion.grupos.movimientos;
  hoja.getCell("F5").value = T.exportacion.grupos.saldoFinal;
  for (const celda of ["A5", "B5", "D5", "F5"]) {
    hoja.getCell(celda).font = { bold: true, color: { argb: "FF18181B" } };
    hoja.getCell(celda).alignment = { horizontal: celda === "A5" ? "left" : "center", vertical: "middle" };
  }

  const titulos = [
    T.exportacion.columnas.cuenta,
    T.exportacion.columnas.saldoInicialDebe,
    T.exportacion.columnas.saldoInicialHaber,
    T.exportacion.columnas.movimientosDebe,
    T.exportacion.columnas.movimientosHaber,
    T.exportacion.columnas.saldoFinalDebe,
    T.exportacion.columnas.saldoFinalHaber,
  ];
  const encabezado = hoja.getRow(FILA_ENCABEZADO);
  encabezado.values = titulos;
  encabezado.height = 22;
  encabezado.font = { bold: true, color: { argb: "FF18181B" } };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
  encabezado.alignment = { horizontal: "right", vertical: "middle" };
  encabezado.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  encabezado.eachCell((celda) => {
    celda.border = { bottom: { style: "thin", color: { argb: "FFA1A1AA" } } };
  });

  for (const linea of balanza.lineas) {
    hoja.addRow([
      `${linea.codigo} ${linea.nombre}${linea.saldoContrario ? ` · ${T.exportacion.notaAlerta}` : ""}`,
      aNumeroExcel(linea.saldoInicialDebe),
      aNumeroExcel(linea.saldoInicialHaber),
      aNumeroExcel(linea.movimientoDebe),
      aNumeroExcel(linea.movimientoHaber),
      aNumeroExcel(linea.saldoFinalDebe),
      aNumeroExcel(linea.saldoFinalHaber),
    ]);
  }

  if (balanza.lineas.length === 0) {
    const filaVacia = hoja.addRow([T.exportacion.vacio]);
    hoja.mergeCells(filaVacia.number, 1, filaVacia.number, 7);
  }

  const filaTotales = hoja.addRow([
    T.exportacion.totales,
    aNumeroExcel(balanza.totales.saldoInicialDebe),
    aNumeroExcel(balanza.totales.saldoInicialHaber),
    aNumeroExcel(balanza.totales.movimientoDebe),
    aNumeroExcel(balanza.totales.movimientoHaber),
    aNumeroExcel(balanza.totales.saldoFinalDebe),
    aNumeroExcel(balanza.totales.saldoFinalHaber),
  ]);
  filaTotales.font = { bold: true };
  filaTotales.border = { top: { style: "thin", color: { argb: "FF71717A" } } };

  const diferencias = [
    [T.exportacion.columnas.diferenciaSaldoInicial, 2, balanza.diferencias.saldoInicial],
    [T.exportacion.columnas.diferenciaMovimientos, 4, balanza.diferencias.movimientos],
    [T.exportacion.columnas.diferenciaSaldoFinal, 6, balanza.diferencias.saldoFinal],
  ] as const;
  for (const [etiqueta, columna, monto] of diferencias) {
    const valores: (string | number | null)[] = Array.from({ length: 7 }, () => null);
    valores[0] = etiqueta;
    valores[columna - 1] = aNumeroExcel(monto);
    const filaDiferencia = hoja.addRow(valores);
    filaDiferencia.font = { italic: true, color: { argb: "FF52525B" } };
  }

  hoja.autoFilter = {
    from: { row: FILA_ENCABEZADO, column: 1 },
    to: { row: Math.max(FILA_ENCABEZADO, FILA_ENCABEZADO + balanza.lineas.length), column: 7 },
  };
  hoja.eachRow((fila, numeroFila) => {
    if (numeroFila <= FILA_ENCABEZADO) return;
    fila.alignment = { vertical: "middle" };
    fila.eachCell((celda, columna) => {
      if (columna > 1 && typeof celda.value === "number") {
        celda.alignment = { horizontal: "right", vertical: "middle" };
        // Los montos siguen siendo decimales de texto en el dominio; number solo representa celdas numéricas de Excel.
        celda.numFmt = T.exportacion.formatoNumero;
      }
    });
  });

  const contenido = await libro.xlsx.writeBuffer();
  return new Blob([contenido], { type: TIPO_EXCEL });
}

/** Descarga el archivo XLSX con el tipo y el período de la consulta en su nombre. */
export function descargarBalanzaExcel(
  contenido: Blob,
  balanza: Pick<Balanza, "tipo" | "desde" | "hasta">,
): void {
  const enlace = document.createElement("a");
  const url = URL.createObjectURL(contenido);
  enlace.href = url;
  enlace.download = `${T.exportacion.prefijoArchivo}-${balanza.tipo}-${balanza.desde}-${balanza.hasta}.xlsx`;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function aNumeroExcel(valor: string): number {
  const monto = Number(valor);
  return Number.isFinite(monto) ? monto : 0;
}
