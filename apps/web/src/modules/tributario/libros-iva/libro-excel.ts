import { formatearFecha } from "@/lib/formato";
import type { DatosExportacionLibro, LibroTabular } from "./libro-tabular";
import { TEXTOS_LIBROS_IVA as T } from "./textos";

const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FILA_ENCABEZADO = 5;
const FORMATO_MONTO = "#,##0.00";

/** Crea el libro de Excel del libro de IVA; los montos son numéricos para que se puedan sumar en la hoja. */
export async function crearLibroIvaExcel(
  libro: LibroTabular,
  datos: DatosExportacionLibro,
  ahora: Date = new Date(),
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema Contable UNIVO";
  workbook.created = ahora;
  const hoja = workbook.addWorksheet(T.exportacion.hoja, {
    views: [{ state: "frozen", ySplit: FILA_ENCABEZADO }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const ultima = libro.columnas.length;

  hoja.mergeCells(1, 1, 1, ultima);
  hoja.getCell(1, 1).value = datos.nrc ? `${datos.empresa} · NRC ${datos.nrc}` : datos.empresa;
  hoja.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FF18181B" } };
  hoja.getRow(1).height = 26;
  hoja.mergeCells(2, 1, 2, ultima);
  hoja.getCell(2, 1).value = libro.titulo;
  hoja.getCell(2, 1).font = { bold: true, size: 13, color: { argb: "FF18181B" } };
  hoja.mergeCells(3, 1, 3, ultima);
  hoja.getCell(3, 1).value = T.exportacion.periodo(
    formatearFecha(libro.desde),
    formatearFecha(libro.hasta),
    datos.alcance,
  );
  hoja.getCell(3, 1).font = { size: 10, color: { argb: "FF52525B" } };
  hoja.mergeCells(4, 1, 4, ultima);
  hoja.getCell(4, 1).value = T.enDolares;
  hoja.getCell(4, 1).font = { size: 10, color: { argb: "FF52525B" } };

  hoja.columns = libro.columnas.map((c) => ({
    key: c.clave,
    width: c.tipo === "monto" ? 16 : ["proveedor", "concepto"].includes(c.clave) ? 34 : 15,
  }));
  const encabezado = hoja.getRow(FILA_ENCABEZADO);
  encabezado.values = libro.columnas.map((c) => c.titulo);
  encabezado.height = 32;
  encabezado.font = { bold: true, color: { argb: "FF18181B" } };
  encabezado.alignment = { vertical: "middle", wrapText: true };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };

  for (const fila of libro.filas) {
    const agregada = hoja.addRow(
      libro.columnas.map((c) => {
        const valor = String(fila[c.clave] ?? "");
        if (c.tipo === "monto") return Number(valor || "0");
        return c.clave === "fecha" ? formatearFecha(valor) : valor;
      }),
    );
    if (fila.anulado) agregada.font = { strike: true, color: { argb: "FF71717A" } };
  }
  if (libro.filas.length > 0) {
    const totales = hoja.addRow(
      libro.columnas.map((c, i) =>
        i === 0 ? T.totales : c.tipo === "monto" ? Number(libro.totales[c.clave] ?? "0") : "",
      ),
    );
    totales.font = { bold: true };
    totales.border = { top: { style: "thin", color: { argb: "FF71717A" } } };
  }
  hoja.eachRow((fila, n) => {
    if (n <= FILA_ENCABEZADO) return;
    fila.eachCell((celda, columna) => {
      if (libro.columnas[columna - 1]?.tipo === "monto") {
        celda.alignment = { horizontal: "right" };
        celda.numFmt = FORMATO_MONTO;
      }
    });
  });
  hoja.autoFilter = {
    from: { row: FILA_ENCABEZADO, column: 1 },
    to: { row: Math.max(hoja.rowCount, FILA_ENCABEZADO), column: ultima },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: TIPO_EXCEL });
}

/** Descarga el archivo .xlsx con el nombre del libro y el período. */
export function descargarLibroIvaExcel(contenido: Blob, nombre: string, desde: string, hasta: string): void {
  const enlace = document.createElement("a");
  const url = URL.createObjectURL(contenido);
  enlace.href = url;
  enlace.download = `${T.exportacion.prefijoArchivo}-${nombre}-${desde}-${hasta}.xlsx`;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
