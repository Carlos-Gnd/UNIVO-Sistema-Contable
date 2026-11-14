import ExcelJS from "exceljs";
import JSZip from "jszip";

/**
 * Solo para pruebas: .xlsx pequeño que al descomprimirse ocupa mucho (bomba zip). Parte de un libro
 * válido y reemplaza su hoja por `filas` filas repetidas, que DEFLATE comprime casi a nada.
 */
export async function bombaZip(nombreHoja: string, filas: number): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.addWorksheet(nombreHoja).addRow(["Código", "Cuenta", "Debe", "Haber"]);
  const zip = await JSZip.loadAsync(await libro.xlsx.writeBuffer());

  const relleno = "x".repeat(600);
  const partes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
  ];
  for (let r = 1; r <= filas; r++) {
    partes.push(`<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${relleno}</t></is></c></row>`);
  }
  partes.push("</sheetData></worksheet>");
  zip.file("xl/worksheets/sheet1.xml", partes.join(""));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
}
