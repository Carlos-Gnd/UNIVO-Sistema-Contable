import { Dinero, type HojaTrabajo, type LineaHojaTrabajo } from "@contable/shared";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { TEXTOS_HOJA_TRABAJO as T } from "./textos";

const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FILA_GRUPOS = 6;
const FILA_ENCABEZADOS = 7;

export interface DatosHojaTrabajoExportacion {
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

const ENCABEZADOS = [
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

/** Genera un XLSX con las diez columnas contables y los totales de la hoja consultada. */
export async function crearHojaTrabajoExcel(
  hojaTrabajo: HojaTrabajo,
  datos: DatosHojaTrabajoExportacion,
  ahora: Date = new Date(),
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  libro.creator = T.exportacion.empresa;
  libro.created = ahora;

  const hoja = libro.addWorksheet(T.exportacion.nombreHoja, {
    views: [{ state: "frozen", ySplit: FILA_ENCABEZADOS, xSplit: 1 }],
    pageSetup: { paperSize: 5, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  hoja.columns = [{ width: 38 }, ...Array.from({ length: 10 }, () => ({ width: 15 }))];

  hoja.mergeCells("A1:K1");
  hoja.getCell("A1").value = datos.empresa;
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFF4F4F5" } };
  hoja.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF090909" } };
  hoja.getRow(1).height = 28;

  hoja.mergeCells("A2:K2");
  hoja.getCell("A2").value = T.titulo;
  hoja.getCell("A2").font = { bold: true, size: 13, color: { argb: "FFF4F4F5" } };
  hoja.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF090909" } };

  hoja.mergeCells("A3:K3");
  hoja.getCell("A3").value = T.exportacion.periodo(
    formatearFecha(hojaTrabajo.desde),
    formatearFecha(hojaTrabajo.hasta),
    datos.alcance,
  );
  hoja.getCell("A3").font = { size: 10, color: { argb: "FF999999" } };

  hoja.mergeCells("A4:K4");
  const avisoResultado = hojaTrabajo.resultado.tipo
    ? hojaTrabajo.resultado.tipo === "utilidad"
      ? T.utilidad(formatearDinero(hojaTrabajo.resultado.monto))
      : T.perdida(formatearDinero(hojaTrabajo.resultado.monto))
    : T.exportacion.notaCuadre(hojaTrabajo.cuadra);
  hoja.getCell("A4").value = avisoResultado;
  hoja.getCell("A4").font = { size: 10, color: { argb: hojaTrabajo.cuadra ? "FF999999" : "FFB91C1C" } };
  if (datos.nota) {
    hoja.mergeCells("A5:K5");
    hoja.getCell("A5").value = datos.nota;
    hoja.getCell("A5").font = { size: 9, color: { argb: "FF999999" } };
  }

  const grupos = [
    { columna: "B", texto: T.encabezados.balanza },
    { columna: "D", texto: T.encabezados.ajustes },
    { columna: "F", texto: T.encabezados.balanzaAjustada },
    { columna: "H", texto: T.encabezados.estadoResultados },
    { columna: "J", texto: T.encabezados.balanceGeneral },
  ];
  hoja.mergeCells(`A${FILA_GRUPOS}:A${FILA_ENCABEZADOS}`);
  hoja.getCell(`A${FILA_GRUPOS}`).value = T.encabezados.cuenta;
  for (const grupo of grupos) {
    const columnaFinal = String.fromCharCode(grupo.columna.charCodeAt(0) + 1);
    hoja.mergeCells(`${grupo.columna}${FILA_GRUPOS}:${columnaFinal}${FILA_GRUPOS}`);
    hoja.getCell(`${grupo.columna}${FILA_GRUPOS}`).value = grupo.texto;
  }

  const filaGrupos = hoja.getRow(FILA_GRUPOS);
  filaGrupos.height = 21;
  const filaEncabezados = hoja.getRow(FILA_ENCABEZADOS);
  filaEncabezados.values = [T.encabezados.codigoCuenta, ...ENCABEZADOS];
  filaEncabezados.height = 21;
  for (const numeroFila of [FILA_GRUPOS, FILA_ENCABEZADOS]) {
    const fila = hoja.getRow(numeroFila);
    fila.font = { bold: true, color: { argb: "FFF4F4F5" } };
    fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202020" } };
    fila.alignment = { horizontal: "center", vertical: "middle" };
    fila.eachCell((celda) => {
      celda.border = { bottom: { style: "thin", color: { argb: "FF555555" } } };
    });
  }
  filaEncabezados.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

  for (const linea of hojaTrabajo.lineas) {
    const fila = hoja.addRow([
      etiquetaCuenta(linea),
      ...COLUMNAS.map((columna) => aNumeroExcel(linea[columna])),
    ]);
    if (linea.resultado) fila.font = { italic: true, color: { argb: "FF999999" } };
  }
  if (hojaTrabajo.lineas.length === 0) {
    const filaVacia = hoja.addRow([T.vacia]);
    hoja.mergeCells(filaVacia.number, 1, filaVacia.number, 11);
  }

  const sumas = totalizar(hojaTrabajo.lineas.filter((linea) => linea.resultado === null));
  agregarTotales(hoja, T.sumasIguales, hojaTrabajo.totales);
  agregarTotales(hoja, T.sumas, sumas);

  const diferencias = [
    [T.exportacion.diferencia.balanza, hojaTrabajo.diferencias.balanza],
    [T.exportacion.diferencia.ajustes, hojaTrabajo.diferencias.ajustes],
    [T.exportacion.diferencia.balanzaAjustada, hojaTrabajo.diferencias.balanzaAjustada],
    [T.exportacion.diferencia.estadoResultados, hojaTrabajo.diferencias.estadoResultados],
    [T.exportacion.diferencia.balanceGeneral, hojaTrabajo.diferencias.balanceGeneral],
  ] as const;
  for (const [etiqueta, monto] of diferencias) {
    hoja.addRow([etiqueta, aNumeroExcel(monto)]);
  }

  hoja.autoFilter = {
    from: { row: FILA_ENCABEZADOS, column: 1 },
    to: { row: Math.max(FILA_ENCABEZADOS, FILA_ENCABEZADOS + hojaTrabajo.lineas.length), column: 11 },
  };
  hoja.eachRow((fila, numeroFila) => {
    if (numeroFila <= FILA_ENCABEZADOS) return;
    fila.alignment = { vertical: "middle" };
    fila.eachCell((celda, columna) => {
      if (columna > 1 && typeof celda.value === "number") {
        celda.alignment = { horizontal: "right", vertical: "middle" };
        // La conversión a number solo representa importes en celdas de Excel; el dominio conserva los montos como texto.
        celda.numFmt = T.exportacion.formatoNumero;
      }
    });
  });

  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: TIPO_EXCEL });
}

/** Descarga el XLSX con el período utilizado en su nombre. */
export function descargarHojaTrabajoExcel(
  contenido: Blob,
  hojaTrabajo: Pick<HojaTrabajo, "desde" | "hasta">,
): void {
  const enlace = document.createElement("a");
  const url = URL.createObjectURL(contenido);
  enlace.href = url;
  enlace.download = `${T.exportacion.prefijoArchivo}-${hojaTrabajo.desde}-${hojaTrabajo.hasta}.xlsx`;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function agregarTotales(
  hoja: import("exceljs").Worksheet,
  etiqueta: string,
  totales: HojaTrabajo["totales"],
): void {
  const fila = hoja.addRow([etiqueta, ...COLUMNAS.map((columna) => aNumeroExcel(totales[columna]))]);
  fila.font = { bold: true };
  fila.border = { top: { style: "thin", color: { argb: "FF555555" } } };
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
