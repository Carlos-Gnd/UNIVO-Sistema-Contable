import ExcelJS from "exceljs";
import JSZip from "jszip";

/** Límite de tiempo (ms) de las pruebas que usan la bomba: generarla es costoso con la máquina cargada. */
export const TIEMPO_LIMITE_BOMBA = 30_000;

/** Generar la bomba comprime decenas de MB (~2 s); se hace una sola vez por proceso de pruebas. */
const generadas = new Map<string, Promise<Buffer>>();

/**
 * Solo para pruebas: .xlsx pequeño que al descomprimirse ocupa mucho (bomba zip). Parte de un libro
 * válido y reemplaza su hoja por `filas` filas repetidas, que DEFLATE comprime casi a nada.
 * El resultado se reutiliza entre pruebas: los llamadores solo lo leen, no lo modifican.
 */
export function bombaZip(nombreHoja: string, filas: number): Promise<Buffer> {
  const clave = `${nombreHoja}|${filas}`;
  let bomba = generadas.get(clave);
  if (!bomba) {
    bomba = generarBombaZip(nombreHoja, filas);
    generadas.set(clave, bomba);
  }
  return bomba;
}

async function generarBombaZip(nombreHoja: string, filas: number): Promise<Buffer> {
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

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 1 } });
}
