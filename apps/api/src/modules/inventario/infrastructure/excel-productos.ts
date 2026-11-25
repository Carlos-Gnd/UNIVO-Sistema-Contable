import ExcelJS from "exceljs";
import { PLANTILLA_PRODUCTOS } from "../domain/importacion-productos.js";

const FILAS_CON_LISTAS = 500;

const lista = (opciones: readonly string[]): ExcelJS.DataValidation => ({
  type: "list",
  allowBlank: true,
  formulae: [`"${opciones.join(",")}"`],
});

/** Plantilla vacía de productos, con listas para el método y las series y una hoja de instrucciones. */
export async function plantillaProductos(categorias: readonly string[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(PLANTILLA_PRODUCTOS.hoja, { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = PLANTILLA_PRODUCTOS.columnas.map((c) => ({
    header: c.titulo,
    key: c.clave,
    width: c.ancho,
  }));
  hoja.getRow(1).font = { bold: true };
  for (let fila = 2; fila <= FILAS_CON_LISTAS + 1; fila++) {
    hoja.getCell(fila, 7).dataValidation = lista(["Promedio ponderado", "PEPS"]);
    hoja.getCell(fila, 8).dataValidation = lista(["Sí", "No"]);
  }
  const ayuda = libro.addWorksheet("Instrucciones");
  ayuda.columns = [{ width: 24 }, { width: 90 }];
  ayuda.addRow([`Llene la hoja «${PLANTILLA_PRODUCTOS.hoja}» sin cambiar los títulos de la fila 1.`]).font = {
    bold: true,
  };
  ayuda.addRow([]);
  ayuda.addRow(["Columna", "Qué escribir"]).font = { bold: true };
  for (const c of PLANTILLA_PRODUCTOS.columnas) ayuda.addRow([c.titulo, c.ayuda]);
  ayuda.addRow([]);
  ayuda.addRow([
    "Categorías disponibles",
    categorias.length > 0 ? categorias.join(", ") : "Aún no hay categorías: créalas antes en Productos.",
  ]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
