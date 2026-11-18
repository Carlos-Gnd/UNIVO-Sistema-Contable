import type { LibroDiario } from "@contable/shared";

const FILA_ENCABEZADO = 6;
const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface DatosLibroDiarioExcel {
  empresa: string;
  nit?: string | null;
  sucursal?: string | null;
  tipo?: string | null;
  nota?: string | null;
}

/** Crea el libro de Excel con todos los folios, renglones y totales del libro diario (S2-T19). */
export async function crearLibroDiarioExcel(
  libro: LibroDiario,
  datos: DatosLibroDiarioExcel,
  ahora: Date = new Date(),
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema Contable UNIVO";
  workbook.created = ahora;

  const worksheet = workbook.addWorksheet("Libro diario", {
    views: [{ state: "frozen", ySplit: FILA_ENCABEZADO }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  worksheet.mergeCells("A1:H1");
  worksheet.getCell("A1").value = datos.empresa;
  worksheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFF4F4F5" } };
  worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF090909" } };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells("A2:H2");
  worksheet.getCell("A2").value = "Libro diario";
  worksheet.getCell("A2").font = { bold: true, size: 13, color: { argb: "FFF4F4F5" } };
  worksheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF090909" } };

  worksheet.mergeCells("A3:H3");
  worksheet.getCell("A3").value =
    `Del ${fecha(libro.desde)} al ${fecha(libro.hasta)} · ${datos.sucursal ?? "Consolidado"}${datos.tipo ? ` · ${datos.tipo}` : ""}${datos.nota ? ` · ${datos.nota}` : ""}`;
  worksheet.getCell("A3").font = { size: 10, color: { argb: "FF999999" } };

  if (datos.nit) {
    worksheet.mergeCells("A4:H4");
    worksheet.getCell("A4").value = `NIT: ${datos.nit}`;
    worksheet.getCell("A4").font = { size: 9, color: { argb: "FF999999" } };
  }

  const columnas = [
    { header: "Folio", key: "folio", width: 12 },
    { header: "Fecha", key: "fecha", width: 15 },
    { header: "Partida", key: "partida", width: 16 },
    { header: "Código", key: "codigo", width: 16 },
    { header: "Cuenta y concepto", key: "descripcion", width: 52 },
    { header: "Parcial", key: "parcial", width: 18 },
    { header: "Debe", key: "debe", width: 18 },
    { header: "Haber", key: "haber", width: 18 },
  ];
  worksheet.columns = columnas.map(({ key, width }) => ({ key, width }));
  worksheet.getRow(FILA_ENCABEZADO).values = columnas.map(({ header }) => header);
  const encabezado = worksheet.getRow(FILA_ENCABEZADO);
  encabezado.height = 22;
  encabezado.font = { bold: true, color: { argb: "FFF4F4F5" } };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202020" } };
  encabezado.alignment = { vertical: "middle" };
  encabezado.eachCell((celda) => {
    celda.border = { bottom: { style: "thin", color: { argb: "FF555555" } } };
  });

  for (const pagina of libro.paginas) {
    const vienen = worksheet.addRow({
      folio: pagina.folio,
      descripcion: "Vienen",
      debe: numero(pagina.vienen.debe),
      haber: numero(pagina.vienen.haber),
    });
    vienen.font = { bold: true, color: { argb: "FFF4F4F5" } };
    vienen.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202020" } };

    for (const renglon of pagina.renglones) {
      const esPartida = renglon.tipo === "partida";
      const fila = worksheet.addRow({
        folio: pagina.folio,
        fecha: renglon.fecha ? fecha(renglon.fecha) : "",
        partida: esPartida && renglon.codigo ? `N.º ${renglon.codigo}` : "",
        codigo: esPartida ? "" : (renglon.codigo ?? ""),
        descripcion: renglon.descripcion,
        parcial: numero(renglon.parcial),
        debe: numero(renglon.debe),
        haber: numero(renglon.haber),
      });
      if (esPartida) {
        fila.font = { bold: true };
        fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF191919" } };
      } else if (renglon.tipo === "subcuenta") {
        fila.getCell(5).alignment = { indent: 1, vertical: "middle" };
      } else if (renglon.tipo === "concepto") {
        fila.getCell(5).font = { italic: true, color: { argb: "FF777777" } };
      }
    }

    const pasan = worksheet.addRow({
      folio: pagina.folio,
      descripcion: "Pasan",
      debe: numero(pagina.pasan.debe),
      haber: numero(pagina.pasan.haber),
    });
    pasan.font = { bold: true, color: { argb: "FFF4F4F5" } };
    pasan.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202020" } };
    pasan.border = { top: { style: "thin", color: { argb: "FF555555" } } };

    const separador = worksheet.addRow([]);
    separador.height = 7;
  }

  const ultimaFila = worksheet.rowCount;
  worksheet.autoFilter = {
    from: { row: FILA_ENCABEZADO, column: 1 },
    to: { row: Math.max(ultimaFila, FILA_ENCABEZADO), column: columnas.length },
  };
  worksheet.eachRow((fila, numero) => {
    if (numero <= FILA_ENCABEZADO) return;
    fila.alignment = { vertical: "middle" };
    fila.eachCell((celda, columna) => {
      if (columna >= 6) {
        celda.alignment = { horizontal: "right", vertical: "middle" };
        if (typeof celda.value === "number") celda.numFmt = "#,##0.00;[Red](#,##0.00);–";
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: TIPO_EXCEL });
}

/** Descarga el archivo .xlsx con fechas para identificar el período exportado. */
export function descargarLibroDiarioExcel(contenido: Blob, desde: string, hasta: string): void {
  const enlace = document.createElement("a");
  const url = URL.createObjectURL(contenido);
  enlace.href = url;
  enlace.download = `libro-diario-${desde}-${hasta}.xlsx`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function numero(valor: string | null): number | null {
  if (valor === null) return null;
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : null;
}

function fecha(valor: string): string {
  const partes = valor.slice(0, 10).split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : valor;
}
