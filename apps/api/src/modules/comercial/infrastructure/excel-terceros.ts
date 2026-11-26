import ExcelJS from "exceljs";
import { PLANTILLA_TERCEROS } from "../domain/importacion-terceros.js";

const FILAS_CON_LISTAS = 500;

const lista = (opciones: readonly string[]): ExcelJS.DataValidation => ({
  type: "list",
  allowBlank: true,
  formulae: [`"${opciones.join(",")}"`],
});

/** Plantilla vacía de clientes y proveedores, con listas para la clasificación y el tipo y una hoja de instrucciones. */
export async function plantillaTerceros(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(PLANTILLA_TERCEROS.hoja, { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = PLANTILLA_TERCEROS.columnas.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho }));
  hoja.getRow(1).font = { bold: true };
  // NIT, NRC y teléfono como texto, para que Excel no les quite ceros ni guiones
  for (const clave of ["nit", "nrc", "telefono"]) hoja.getColumn(clave).numFmt = "@";
  for (let fila = 2; fila <= FILAS_CON_LISTAS + 1; fila++) {
    hoja.getCell(fila, 5).dataValidation = lista([
      "Gran contribuyente",
      "Mediano contribuyente",
      "Otro contribuyente",
    ]);
    hoja.getCell(fila, 9).dataValidation = lista(["Cliente", "Proveedor", "Ambos"]);
  }
  const ayuda = libro.addWorksheet("Instrucciones");
  ayuda.columns = [{ width: 24 }, { width: 90 }];
  ayuda.addRow([`Llene la hoja «${PLANTILLA_TERCEROS.hoja}» sin cambiar los títulos de la fila 1.`]).font = {
    bold: true,
  };
  ayuda.addRow([]);
  ayuda.addRow(["Columna", "Qué escribir"]).font = { bold: true };
  for (const c of PLANTILLA_TERCEROS.columnas) ayuda.addRow([c.titulo, c.ayuda]);
  ayuda.addRow([]);
  ayuda.addRow(["Si alguna fila tiene errores no se importa nada; el sistema muestra los errores por fila."]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
