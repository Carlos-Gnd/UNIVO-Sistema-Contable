import type { Workbook, Worksheet } from "exceljs";
import { descargarArchivo } from "@/lib/descargas";
import type { DocumentoEstado, EncabezadoDocumento, FirmasDocumento } from "./documento-estado";
import { TEXTOS_EXPORTACION as T } from "./textos";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Fila donde empieza la tabla: título del documento (1 a 3), logotipo opcional y cabecera. */
const FILAS_ENCABEZADO = 4;

/** Crea el estado en XLSX conservando los montos como celdas numéricas. */
export async function crearExcel(
  documento: DocumentoEstado,
  encabezado: EncabezadoDocumento,
  firmas: FirmasDocumento,
  anexo?: DocumentoEstado,
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  libro.creator = T.creador;

  const columnas = documento.columnas.length + 1;
  const hoja = libro.addWorksheet(documento.nombreHoja, {
    views: [{ state: "frozen", ySplit: FILAS_ENCABEZADO }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  hoja.columns = [{ width: 60 }, ...documento.columnas.map(() => ({ width: 20 }))];

  const combinada = (fila: number, valor: string, fuente: { bold?: boolean; size?: number }) => {
    hoja.mergeCells(fila, 1, fila, columnas);
    const celda = hoja.getCell(fila, 1);
    celda.value = valor;
    celda.font = fuente;
  };
  combinada(1, encabezado.empresa, { bold: true, size: 15 });
  hoja.getRow(1).height = 26;
  combinada(2, documento.titulo, { bold: true, size: 13 });
  combinada(3, `${T.periodo(documento.periodo, encabezado.alcance)} · ${T.moneda}`, {});

  const cabecera = hoja.addRow([T.concepto, ...documento.columnas.map((c) => c.titulo)]);
  cabecera.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecera.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27272A" } };
  cabecera.alignment = { vertical: "middle" };
  for (let i = 2; i <= columnas; i++) {
    cabecera.getCell(i).alignment = { horizontal: "right", vertical: "middle" };
  }

  for (const filaDoc of documento.filas) {
    if (filaDoc.tipo === "parrafo") {
      const parrafo = hoja.addRow([filaDoc.texto]);
      hoja.mergeCells(parrafo.number, 1, parrafo.number, columnas);
      parrafo.getCell(1).alignment = { wrapText: true, vertical: "top", indent: 1 };
      // Excel no ajusta solo el alto de las celdas combinadas: se calcula por el largo del texto
      parrafo.height =
        15 * Math.max(1, Math.ceil(filaDoc.texto.length / (60 + 20 * documento.columnas.length)));
      continue;
    }
    const fila = hoja.addRow([
      filaDoc.texto,
      ...documento.columnas.map((columna, i) => {
        const valor = filaDoc.valores?.[i];
        if (valor === undefined) return null;
        return columna.tipo === "dinero" ? aNumeroExcel(valor) : valor;
      }),
    ]);
    fila.alignment = { vertical: "middle" };
    if (filaDoc.tipo === "seccion") {
      fila.font = { bold: true };
      fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
    } else if (filaDoc.tipo === "resultado" || filaDoc.tipo === "total") {
      fila.font = { bold: true };
      fila.border = { top: { style: "thin", color: { argb: "FFD4D4D8" } } };
    } else {
      fila.getCell(1).alignment = { indent: 1, vertical: "middle" };
    }
    documento.columnas.forEach((columna, i) => {
      const celda = fila.getCell(i + 2);
      if (columna.tipo === "dinero" && typeof celda.value === "number") celda.numFmt = T.formatoNumero;
      if (celda.value !== null) celda.alignment = { horizontal: "right", vertical: "middle" };
    });
  }

  if (firmas.incluir) agregarFirmas(hoja, columnas, firmas);
  await agregarLogo(libro, hoja, encabezado.logoUrl, columnas);
  if (anexo) agregarAnexo(libro, anexo, encabezado);

  hoja.autoFilter = {
    from: { row: FILAS_ENCABEZADO, column: 1 },
    to: { row: Math.max(FILAS_ENCABEZADO, FILAS_ENCABEZADO + documento.filas.length), column: columnas },
  };

  const archivo = await libro.xlsx.writeBuffer();
  return new Blob([archivo], { type: TIPO_XLSX });
}

/** Segunda hoja del libro con un anexo (las notas a los estados), con su propio encabezado. */
function agregarAnexo(libro: Workbook, anexo: DocumentoEstado, encabezado: EncabezadoDocumento): void {
  const columnas = anexo.columnas.length + 1;
  const hoja = libro.addWorksheet(anexo.nombreHoja, {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  hoja.columns = [{ width: 60 }, ...anexo.columnas.map(() => ({ width: 20 }))];
  const titulo = (fila: number, valor: string, fuente: { bold?: boolean; size?: number }) => {
    hoja.mergeCells(fila, 1, fila, columnas);
    hoja.getCell(fila, 1).value = valor;
    hoja.getCell(fila, 1).font = fuente;
  };
  titulo(1, encabezado.empresa, { bold: true, size: 15 });
  titulo(2, anexo.titulo, { bold: true, size: 13 });
  titulo(3, `${T.periodo(anexo.periodo, encabezado.alcance)} · ${T.moneda}`, {});
  for (const filaDoc of anexo.filas) {
    if (filaDoc.tipo === "parrafo") {
      const parrafo = hoja.addRow([filaDoc.texto]);
      hoja.mergeCells(parrafo.number, 1, parrafo.number, columnas);
      parrafo.getCell(1).alignment = { wrapText: true, vertical: "top", indent: 1 };
      parrafo.height = 15 * Math.max(1, Math.ceil(filaDoc.texto.length / (60 + 20 * anexo.columnas.length)));
      continue;
    }
    const fila = hoja.addRow([filaDoc.texto, ...anexo.columnas.map((_, i) => filaDoc.valores?.[i] ?? null)]);
    if (filaDoc.tipo === "seccion") {
      fila.font = { bold: true };
      fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
    } else if (filaDoc.tipo === "total" || filaDoc.tipo === "resultado") {
      fila.font = { bold: true };
    } else {
      fila.getCell(1).alignment = { indent: 1 };
    }
    for (let i = 2; i <= columnas; i++) fila.getCell(i).alignment = { horizontal: "right" };
  }
}

export function descargarExcel(archivo: Blob, documento: Pick<DocumentoEstado, "nombreArchivo">): void {
  descargarArchivo(archivo, `${documento.nombreArchivo}.xlsx`);
}

/** El propietario firma en la primera columna y el contador en la última. */
function agregarFirmas(hoja: Worksheet, columnas: number, firmas: FirmasDocumento): void {
  const ultima = columnas === 1 ? 1 : columnas;
  hoja.addRow([]);
  hoja.addRow([]).height = 28;
  const linea = (valores: [string, string], estilo: { size?: number; bold?: boolean; argb?: string }) => {
    const fila = hoja.addRow([]);
    fila.getCell(1).value = valores[0];
    fila.getCell(ultima).value = valores[1];
    fila.font = {
      ...(estilo.bold ? { bold: true } : {}),
      ...(estilo.size ? { size: estilo.size } : {}),
      ...(estilo.argb ? { color: { argb: estilo.argb } } : {}),
    };
    for (const i of new Set([1, ultima])) fila.getCell(i).alignment = { horizontal: "center" };
    return fila;
  };
  const nombres = linea([firmas.propietario.trim(), firmas.contador.trim()], { bold: true });
  for (const i of new Set([1, ultima])) {
    nombres.getCell(i).border = { top: { style: "thin", color: { argb: "FF52525B" } } };
  }
  linea([T.representante, T.contador], { size: 9, argb: "FF71717A" });
  const registro = firmas.registroContador.trim();
  if (registro) linea(["", T.inscripcion(registro)], { size: 9, argb: "FF71717A" });
}

/** Inserta el logotipo en la esquina superior derecha; si no se puede descargar, el estado sale sin él. */
async function agregarLogo(
  libro: Workbook,
  hoja: Worksheet,
  url: string | null,
  columnas: number,
): Promise<void> {
  if (!url) return;
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) return;
    const tipo = respuesta.headers.get("content-type") ?? "";
    const extension = tipo.includes("png")
      ? "png"
      : tipo.includes("jpeg") || tipo.includes("jpg")
        ? "jpeg"
        : null;
    if (!extension) return;
    const id = libro.addImage({ buffer: await respuesta.arrayBuffer(), extension });
    hoja.addImage(id, {
      tl: { col: Math.max(columnas - 1, 1), row: 0 },
      ext: { width: 90, height: 45 },
    });
  } catch {
    // Sin red o sin permiso de lectura de la imagen: se omite el logotipo
  }
}

function aNumeroExcel(monto: string): number {
  // Solo para celdas numéricas de Excel; el dominio mantiene los montos como texto decimal
  const numero = Number(monto);
  return Number.isFinite(numero) ? numero : 0;
}
