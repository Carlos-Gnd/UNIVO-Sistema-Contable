import { Dinero, type HojaTrabajo, type LineaHojaTrabajo } from "@contable/shared";
import { descargarArchivo } from "@/lib/descargas";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { TEXTOS_EXPORTACION_HOJA_TRABAJO as T } from "./textos";

const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FILA_GRUPOS = 6;
const FILA_ENCABEZADOS = 7;

export interface DatosHojaTrabajoExcel {
  empresa: string;
  alcance: string;
  nota?: string | null;
}

const COLUMNAS = [
  "balanzaDebe",
  "balanzaHaber",
  "ajustesDebe",
  "ajustesHaber",
  "balanzaAjustadaDebe",
  "balanzaAjustadaHaber",
  "estadoResultadosDebe",
  "estadoResultadosHaber",
  "balanceGeneralDebe",
  "balanceGeneralHaber",
] as const satisfies readonly (keyof HojaTrabajo["totales"])[];

const SUBENCABEZADOS = [
  T.encabezados.debe,
  T.encabezados.haber,
  T.encabezados.debe,
  T.encabezados.haber,
  T.encabezados.debe,
  T.encabezados.haber,
  T.encabezados.debe,
  T.encabezados.haber,
  T.encabezados.debe,
  T.encabezados.haber,
];

/** Construye un XLSX descargable con las diez columnas y los totales de la hoja consultada. */
export async function crearHojaTrabajoExcel(
  reporte: HojaTrabajo,
  datos: DatosHojaTrabajoExcel,
  ahora: Date = new Date(),
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  libro.creator = T.empresa;
  libro.created = ahora;

  const hoja = libro.addWorksheet(T.nombreHoja, {
    views: [{ state: "frozen", ySplit: FILA_ENCABEZADOS, xSplit: 1 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  hoja.columns = [{ width: 38 }, ...Array.from({ length: 10 }, () => ({ width: 16 }))];

  hoja.mergeCells("A1:K1");
  hoja.getCell("A1").value = datos.empresa;
  hoja.getCell("A1").font = { bold: true, size: 16 };
  hoja.getRow(1).height = 28;

  hoja.mergeCells("A2:K2");
  hoja.getCell("A2").value = T.titulo;
  hoja.getCell("A2").font = { bold: true, size: 13 };

  hoja.mergeCells("A3:K3");
  hoja.getCell("A3").value = T.exportacion.periodo(
    formatearFecha(reporte.desde),
    formatearFecha(reporte.hasta),
    datos.alcance,
  );
  if (datos.nota) {
    hoja.mergeCells("A4:K4");
    hoja.getCell("A4").value = datos.nota;
  }

  hoja.mergeCells("A5:K5");
  const aviso =
    reporte.resultado.tipo === "utilidad"
      ? T.exportacion.utilidad(formatearDinero(reporte.resultado.monto))
      : reporte.resultado.tipo === "perdida"
        ? T.exportacion.perdida(formatearDinero(reporte.resultado.monto))
        : T.exportacion.notaCuadre(reporte.cuadra);
  hoja.getCell("A5").value = aviso;

  hoja.getCell(`A${FILA_GRUPOS}`).value = T.encabezados.grupoCuenta;
  const grupos = [
    ["B", "C", T.encabezados.balanza],
    ["D", "E", T.encabezados.ajustes],
    ["F", "G", T.encabezados.balanzaAjustada],
    ["H", "I", T.encabezados.estadoResultados],
    ["J", "K", T.encabezados.balanceGeneral],
  ] as const;
  for (const [inicio, fin, titulo] of grupos) {
    hoja.mergeCells(`${inicio}${FILA_GRUPOS}:${fin}${FILA_GRUPOS}`);
    hoja.getCell(`${inicio}${FILA_GRUPOS}`).value = titulo;
  }

  for (const numeroFila of [FILA_GRUPOS, FILA_ENCABEZADOS]) {
    const fila = hoja.getRow(numeroFila);
    fila.height = 22;
    fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
    fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27272A" } };
    fila.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fila.eachCell((celda) => {
      celda.border = { bottom: { style: "thin", color: { argb: "FF71717A" } } };
    });
  }
  hoja.getRow(FILA_ENCABEZADOS).values = [T.encabezados.cuenta, ...SUBENCABEZADOS];
  hoja.getCell(`A${FILA_GRUPOS}`).alignment = { horizontal: "left", vertical: "middle" };
  hoja.getCell(`A${FILA_ENCABEZADOS}`).alignment = { horizontal: "left", vertical: "middle" };

  for (const linea of reporte.lineas) {
    const fila = hoja.addRow([
      etiquetaCuenta(linea),
      ...COLUMNAS.map((columna) => aNumeroExcel(linea[columna])),
    ]);
    fila.alignment = { vertical: "middle" };
    if (linea.resultado) fila.font = { italic: true, color: { argb: "FF52525B" } };
  }
  if (reporte.lineas.length === 0) {
    const filaVacia = hoja.addRow([T.vacia]);
    hoja.mergeCells(filaVacia.number, 1, filaVacia.number, 11);
  }

  // El total de la API incluye la línea calculada de utilidad/pérdida; esta fila debe mostrar las cuentas sin ella.
  const sumas = totalizar(reporte.lineas.filter((linea) => linea.resultado === null));
  agregarTotales(hoja, T.sumasIguales, reporte.totales);
  agregarTotales(hoja, T.sumas, sumas);

  const diferencias = [
    [T.exportacion.diferencia.balanza, reporte.diferencias.balanza],
    [T.exportacion.diferencia.ajustes, reporte.diferencias.ajustes],
    [T.exportacion.diferencia.balanzaAjustada, reporte.diferencias.balanzaAjustada],
    [T.exportacion.diferencia.estadoResultados, reporte.diferencias.estadoResultados],
    [T.exportacion.diferencia.balanceGeneral, reporte.diferencias.balanceGeneral],
  ] as const;
  for (const [etiqueta, monto] of diferencias) hoja.addRow([etiqueta, aNumeroExcel(monto)]);

  hoja.autoFilter = {
    from: { row: FILA_ENCABEZADOS, column: 1 },
    to: { row: Math.max(FILA_ENCABEZADOS, FILA_ENCABEZADOS + reporte.lineas.length), column: 11 },
  };
  hoja.eachRow((fila, numeroFila) => {
    if (numeroFila <= FILA_ENCABEZADOS) return;
    fila.eachCell((celda, columna) => {
      if (columna > 1 && typeof celda.value === "number") {
        celda.alignment = { horizontal: "right", vertical: "middle" };
        // La conversión a number es solo para que Excel trate el importe como numérico; el dominio conserva texto decimal.
        celda.numFmt = T.exportacion.formatoNumero;
      }
    });
  });

  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: TIPO_EXCEL });
}

export function descargarHojaTrabajoExcel(
  contenido: Blob,
  reporte: Pick<HojaTrabajo, "desde" | "hasta">,
): void {
  descargarArchivo(contenido, `${T.exportacion.archivo}-${reporte.desde}-${reporte.hasta}.xlsx`);
}

function agregarTotales(
  hoja: import("exceljs").Worksheet,
  etiqueta: string,
  totales: HojaTrabajo["totales"],
): void {
  const fila = hoja.addRow([etiqueta, ...COLUMNAS.map((columna) => aNumeroExcel(totales[columna]))]);
  fila.font = { bold: true };
  fila.border = { top: { style: "thin", color: { argb: "FF71717A" } } };
}

function totalizar(lineas: readonly LineaHojaTrabajo[]): HojaTrabajo["totales"] {
  return Object.fromEntries(
    COLUMNAS.map((columna) => [columna, Dinero.sumar(lineas.map((linea) => linea[columna])).aTexto()]),
  ) as HojaTrabajo["totales"];
}

function etiquetaCuenta(linea: LineaHojaTrabajo): string {
  return linea.codigo ? `${linea.codigo} ${linea.nombre}` : linea.nombre;
}

function aNumeroExcel(valor: string): number {
  const monto = Number(valor);
  return Number.isFinite(monto) ? monto : 0;
}
