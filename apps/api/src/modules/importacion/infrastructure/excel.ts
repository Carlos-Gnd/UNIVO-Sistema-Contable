import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { MAXIMO_FILAS_IMPORTACION } from "@contable/shared";
import {
  ArchivoInvalidoError,
  NATURALEZAS,
  TIPOS_CUENTA,
  type CuentaExistente,
  type LibrosExcel,
  type Plantilla,
} from "../domain/plantillas.js";
import { normalizar, type FilaLeida, type HojaLeida } from "../domain/validacion.js";

/** Filas de la plantilla vacía del catálogo que traen las listas de naturaleza y tipo. */
const FILAS_CON_LISTAS = 500;
const FORMATO_MONTO = "#,##0.00";

const lista = (valores: string[]): ExcelJS.DataValidation => ({
  type: "list",
  allowBlank: true,
  formulae: [`"${valores.join(",")}"`],
  showErrorMessage: true,
  errorTitle: "Valor no válido",
  error: `Elija uno de: ${valores.join(", ")}.`,
});

const MONTO_NO_NEGATIVO: ExcelJS.DataValidation = {
  type: "decimal",
  operator: "greaterThanOrEqual",
  allowBlank: true,
  formulae: [0],
  showErrorMessage: true,
  errorTitle: "Monto no válido",
  error: "Escriba un monto mayor o igual a cero, con dos decimales como máximo.",
};

function hojaDeDatos(libro: ExcelJS.Workbook, plantilla: Plantilla): ExcelJS.Worksheet {
  const hoja = libro.addWorksheet(plantilla.hoja, { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = plantilla.columnas.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho }));
  const titulos = hoja.getRow(1);
  titulos.font = { bold: true, color: { argb: "FFFFFFFF" } };
  titulos.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  // El código como texto, para que Excel no lo convierta en número ni le quite ceros
  hoja.getColumn("codigo").numFmt = "@";
  return hoja;
}

function hojaDeInstrucciones(libro: ExcelJS.Workbook, plantilla: Plantilla, notas: string[]) {
  const hoja = libro.addWorksheet("Instrucciones");
  hoja.columns = [{ width: 18 }, { width: 100 }];
  hoja.addRow([`Llene la hoja «${plantilla.hoja}» sin cambiar los títulos de la fila 1.`]).font = {
    bold: true,
  };
  hoja.addRow([]);
  hoja.addRow(["Columna", "Qué escribir"]).font = { bold: true };
  for (const c of plantilla.columnas) hoja.addRow([c.titulo, c.ayuda]);
  hoja.addRow([]);
  for (const nota of notas) hoja.addRow([nota]);
}

/** Plantilla vacía del catálogo, con listas para naturaleza y tipo (S1-T68). */
export async function plantillaCatalogo(plantilla: Plantilla): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = hojaDeDatos(libro, plantilla);
  const naturalezas = lista(Object.values(NATURALEZAS));
  const tipos = lista(Object.values(TIPOS_CUENTA));
  for (let fila = 2; fila <= FILAS_CON_LISTAS + 1; fila++) {
    hoja.getCell(fila, 3).dataValidation = naturalezas;
    hoja.getCell(fila, 4).dataValidation = tipos;
  }
  hojaDeInstrucciones(libro, plantilla, [
    "Cada cuenta necesita a su cuenta padre, en este archivo o en el catálogo de la empresa.",
    "Ejemplo: 1 Activo › 11 Activo corriente › 1101 Efectivo y equivalentes › 110101 Caja general.",
    "Los códigos que ya existen en el catálogo de la empresa no se pueden volver a importar.",
    "Si alguna fila tiene errores no se importa nada; el sistema muestra los errores por fila.",
  ]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

/**
 * Plantilla de saldos iniciales con las cuentas de último nivel activas de la empresa ya escritas, para
 * que solo se llenen los montos (S1-T68).
 */
export async function plantillaSaldos(
  plantilla: Plantilla,
  cuentas: readonly CuentaExistente[],
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = hojaDeDatos(libro, plantilla);
  hoja.getColumn("debe").numFmt = FORMATO_MONTO;
  hoja.getColumn("haber").numFmt = FORMATO_MONTO;
  const imputables = cuentas
    .filter((c) => c.imputable && c.activa)
    .toSorted((a, b) => a.codigo.localeCompare(b.codigo));
  for (const c of imputables) {
    const fila = hoja.addRow({ codigo: c.codigo, cuenta: c.nombre });
    fila.getCell("debe").dataValidation = MONTO_NO_NEGATIVO;
    fila.getCell("haber").dataValidation = MONTO_NO_NEGATIVO;
  }
  hojaDeInstrucciones(libro, plantilla, [
    "La hoja trae las cuentas de último nivel activas del catálogo; deje vacías las que no tienen saldo.",
    "Con estos saldos se genera la partida de apertura en borrador; revise que el debe y el haber cuadren.",
    "Si alguna fila tiene errores no se carga nada; el sistema muestra los errores por fila.",
  ]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

/** Texto de una celda, sea texto, número, fórmula, enlace o texto con formato. */
export function textoDeCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return String(Number(valor.toPrecision(15))); // 0.1 + 0.2 → 0.3
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "boolean") return valor ? "VERDADERO" : "FALSO";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if ("richText" in valor)
    return valor.richText
      .map((t) => t.text)
      .join("")
      .trim();
  if ("formula" in valor || "sharedFormula" in valor) {
    return textoDeCelda((valor as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }
  if ("text" in valor) return textoDeCelda(valor.text as ExcelJS.CellValue);
  return ""; // errores de Excel (#N/A, #REF!…)
}

/** Tamaño total descomprimido permitido: de sobra para 5000 filas. */
export const MAXIMO_BYTES_DESCOMPRIMIDOS = 20 * 1024 * 1024;

export const MENSAJE_DEMASIADO_GRANDE = "El archivo es demasiado grande una vez descomprimido.";

/**
 * Protege contra bombas zip: un .xlsx es un zip y ExcelJS lo descomprime entero en memoria. Antes de
 * cargarlo se descomprime cada entrada por flujo, contando los bytes reales sin acumularlos, y se corta
 * al pasar el máximo. Se cuentan los bytes reales y no el tamaño que declara el índice del zip, porque
 * un archivo manipulado puede declarar uno falso.
 */
async function exigirTamanoSeguro(archivo: Buffer): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archivo); // lee el índice; no descomprime el contenido
  } catch {
    throw new ArchivoInvalidoError();
  }
  let total = 0;
  for (const entrada of Object.values(zip.files)) {
    if (entrada.dir) continue;
    await new Promise<void>((resolver, rechazar) => {
      const flujo = entrada.nodeStream("nodebuffer");
      flujo.on("data", (trozo: Buffer) => {
        total += trozo.length;
        if (total > MAXIMO_BYTES_DESCOMPRIMIDOS) {
          flujo.removeAllListeners();
          flujo.pause();
          rechazar(new ArchivoInvalidoError(MENSAJE_DEMASIADO_GRANDE));
        }
      });
      flujo.on("end", () => resolver());
      flujo.on("error", () => rechazar(new ArchivoInvalidoError()));
    });
  }
}

/**
 * Lee la hoja de la plantilla (o la primera, si se renombró) y devuelve sus filas con datos (S1-T69).
 * Las columnas se buscan por su título en la fila 1, en cualquier orden.
 */
export async function leerHoja(archivo: Buffer, plantilla: Plantilla): Promise<HojaLeida> {
  await exigirTamanoSeguro(archivo);
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(archivo as unknown as ExcelJS.Buffer);
  } catch {
    throw new ArchivoInvalidoError();
  }
  const hoja = libro.getWorksheet(plantilla.hoja) ?? libro.worksheets[0];
  if (!hoja) throw new ArchivoInvalidoError();

  const posiciones = new Map<string, number>();
  hoja.getRow(1).eachCell((celda, columna) => posiciones.set(normalizar(textoDeCelda(celda.value)), columna));
  const columnas = plantilla.columnas.map((c) => ({ ...c, posicion: posiciones.get(normalizar(c.titulo)) }));
  const columnasFaltantes = columnas.filter((c) => c.posicion === undefined).map((c) => c.titulo);
  if (columnasFaltantes.length > 0) return { columnasFaltantes, filas: [], excedeMaximo: false };

  const filas: FilaLeida[] = [];
  let excedeMaximo = false;
  hoja.eachRow((row, numero) => {
    if (numero === 1 || excedeMaximo) return;
    const valores = Object.fromEntries(
      columnas.map((c) => [c.clave, textoDeCelda(row.getCell(c.posicion!).value)]),
    );
    if (Object.values(valores).every((v) => v === "")) return;
    if (filas.length === MAXIMO_FILAS_IMPORTACION) excedeMaximo = true;
    else filas.push({ fila: numero, valores });
  });
  return { columnasFaltantes: [], filas, excedeMaximo };
}

/** Implementación del puerto LibrosExcel con ExcelJS. */
@Injectable()
export class LibrosExcelJs implements LibrosExcel {
  plantillaCatalogo = plantillaCatalogo;
  plantillaSaldos = plantillaSaldos;
  leerHoja = leerHoja;
}
