import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

/** Colores de los documentos generados por la API (mismos tonos que la exportación de la web). */
export const COLOR = {
  texto: rgb(0.094, 0.094, 0.106),
  suave: rgb(0.322, 0.322, 0.357),
  tenue: rgb(0.443, 0.443, 0.478),
  linea: rgb(0.831, 0.831, 0.847),
  fondo: rgb(0.957, 0.957, 0.961),
  marca: rgb(0.086, 0.396, 0.204),
} as const;

/** Carta en puntos PDF. */
export const CARTA = { ancho: 612, alto: 792, margen: 48 } as const;

/**
 * Las fuentes estándar de PDF usan WinAnsi: cubren el español (tildes, ñ, ¿, ¡) pero no cualquier carácter
 * Unicode. Lo que no se puede escribir se reemplaza para que el documento siempre se genere.
 */
export function textoPdf(valor: string): string {
  return valor
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF–—“”‘’•…€]/g, "?");
}

/** Corta el texto en líneas que caben en el ancho dado. */
export function partirTexto(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const palabras = textoPdf(texto).split(" ");
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (fuente.widthOfTextAtSize(prueba, tamano) <= ancho || !actual) {
      actual = prueba;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  // Una palabra más ancha que el espacio se recorta con puntos suspensivos
  return lineas.map((l) => {
    if (fuente.widthOfTextAtSize(l, tamano) <= ancho) return l;
    let corto = l;
    while (corto.length > 1 && fuente.widthOfTextAtSize(`${corto}…`, tamano) > ancho)
      corto = corto.slice(0, -1);
    return `${corto}…`;
  });
}

/** Escribe el texto alineado a la derecha terminando en x. */
export function textoDerecha(
  pagina: PDFPage,
  texto: string,
  x: number,
  y: number,
  fuente: PDFFont,
  tamano: number,
  color = COLOR.texto,
): void {
  const limpio = textoPdf(texto);
  pagina.drawText(limpio, {
    x: x - fuente.widthOfTextAtSize(limpio, tamano),
    y,
    size: tamano,
    font: fuente,
    color,
  });
}

/** Imagen PNG del código QR del enlace. */
export function qrPng(enlace: string): Promise<Buffer> {
  return QRCode.toBuffer(enlace, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 240 });
}

/** Monto con separador de miles y dos decimales, sin símbolo (12,345.60). */
export function formatoMonto(monto: string | number): string {
  const n = typeof monto === "number" ? monto : Number(monto);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
