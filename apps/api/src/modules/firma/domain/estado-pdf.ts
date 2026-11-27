import { randomInt } from "node:crypto";
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { FirmarEstado } from "@contable/shared";
import { CARTA, COLOR, formatoMonto, partirTexto, textoDerecha, textoPdf } from "./pdf-utilidades.js";

/**
 * PDF de un estado financiero para firmarlo (HU-87): encabezado con la empresa, título y período, y la tabla con las
 * mismas filas que exporta la web. Al final queda espacio para la firma visible y el QR.
 */

export interface EncabezadoEstado {
  empresa: string;
  nit: string;
}

/** Alto que se reserva en la última página para el recuadro de la firma. */
export const ALTO_FIRMA = 140;

/** Sin I, O, 0 ni 1: no se confunden al dictar o escribir el código. */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Código de verificación XXXX-XXXX-XXXX que lleva el QR. */
export function nuevoCodigoVerificacion(): string {
  const grupo = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  return `${grupo()}-${grupo()}-${grupo()}`;
}

/** Enlace del portal de verificación de la web. */
export function urlVerificacion(
  codigo: string,
  webUrl = process.env["WEB_URL"] ?? "http://localhost:5173",
): string {
  return `${webUrl.trim().replace(/\/+$/, "")}/verificar/${encodeURIComponent(codigo)}`;
}

interface Lienzo {
  pdf: PDFDocument;
  pagina: PDFPage;
  y: number;
  fuente: PDFFont;
  negrita: PDFFont;
}

const ANCHO_UTIL = CARTA.ancho - CARTA.margen * 2;

export async function estadoPdf(estado: FirmarEstado, encabezado: EncabezadoEstado): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(textoPdf(`${estado.titulo} - ${encabezado.empresa}`));
  pdf.setAuthor(textoPdf(encabezado.empresa));
  pdf.setProducer("Sistema Contable UNIVO");
  const l: Lienzo = {
    pdf,
    pagina: pdf.addPage([CARTA.ancho, CARTA.alto]),
    y: CARTA.alto - CARTA.margen,
    fuente: await pdf.embedFont(StandardFonts.Helvetica),
    negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const centrado = (texto: string, tamano: number, negrita = false, color = COLOR.texto) => {
    const fuente = negrita ? l.negrita : l.fuente;
    for (const t of partirTexto(texto, fuente, tamano, ANCHO_UTIL)) {
      l.pagina.drawText(t, {
        x: (CARTA.ancho - fuente.widthOfTextAtSize(t, tamano)) / 2,
        y: l.y,
        size: tamano,
        font: fuente,
        color,
      });
      l.y -= tamano + 4;
    }
  };
  centrado(encabezado.empresa, 13, true);
  if (encabezado.nit) centrado(`NIT ${encabezado.nit}`, 9, false, COLOR.suave);
  if (estado.alcance) centrado(estado.alcance, 9, false, COLOR.suave);
  l.y -= 4;
  centrado(estado.titulo, 15, true);
  centrado(estado.periodo, 10, false, COLOR.suave);
  centrado("(Cifras expresadas en dólares de los Estados Unidos de América)", 8, false, COLOR.tenue);
  l.y -= 8;

  // La primera columna (concepto) ocupa lo que dejan las columnas de valores
  const anchoValor = Math.min(110, (ANCHO_UTIL * 0.55) / estado.columnas.length);
  const anchoConcepto = ANCHO_UTIL - anchoValor * estado.columnas.length;

  const nuevaPagina = () => {
    l.pagina = pdf.addPage([CARTA.ancho, CARTA.alto]);
    l.y = CARTA.alto - CARTA.margen;
  };
  const asegurar = (alto: number) => {
    if (l.y - alto < CARTA.margen + 20) nuevaPagina();
  };

  const cabecera = () => {
    asegurar(20);
    l.pagina.drawText("CONCEPTO", {
      x: CARTA.margen + 4,
      y: l.y,
      size: 7.5,
      font: l.negrita,
      color: COLOR.tenue,
    });
    estado.columnas.forEach((c, i) => {
      const x = CARTA.margen + anchoConcepto + anchoValor * (i + 1) - 4;
      textoDerecha(l.pagina, c.titulo.toUpperCase(), x, l.y, l.negrita, 7.5, COLOR.tenue);
    });
    l.y -= 6;
    l.pagina.drawLine({
      start: { x: CARTA.margen, y: l.y },
      end: { x: CARTA.margen + ANCHO_UTIL, y: l.y },
      thickness: 0.6,
      color: COLOR.linea,
    });
    l.y -= 12;
  };
  cabecera();

  for (const fila of estado.filas) {
    if (fila.tipo === "parrafo") {
      const lineas = partirTexto(fila.texto, l.fuente, 8.5, ANCHO_UTIL - 8);
      for (const t of lineas) {
        asegurar(12);
        l.pagina.drawText(t, { x: CARTA.margen + 4, y: l.y, size: 8.5, font: l.fuente, color: COLOR.suave });
        l.y -= 12;
      }
      l.y -= 4;
      continue;
    }
    const destacada = fila.tipo !== "renglon";
    const fuente = destacada ? l.negrita : l.fuente;
    const tamano = fila.tipo === "resultado" ? 9.5 : 8.5;
    const lineas = partirTexto(fila.texto, fuente, tamano, anchoConcepto - 12);
    const alto = lineas.length * (tamano + 3) + 6;
    asegurar(alto);
    if (fila.tipo === "seccion") {
      l.pagina.drawRectangle({
        x: CARTA.margen,
        y: l.y - alto + tamano + 3,
        width: ANCHO_UTIL,
        height: alto,
        color: COLOR.fondo,
      });
    }
    if (fila.tipo === "total" || fila.tipo === "resultado") {
      l.pagina.drawLine({
        start: { x: CARTA.margen + anchoConcepto, y: l.y + tamano + 2 },
        end: { x: CARTA.margen + ANCHO_UTIL, y: l.y + tamano + 2 },
        thickness: fila.tipo === "resultado" ? 1 : 0.6,
        color: COLOR.suave,
      });
    }
    const sangria = fila.tipo === "renglon" ? 14 : 4;
    lineas.forEach((t, k) =>
      l.pagina.drawText(t, {
        x: CARTA.margen + sangria,
        y: l.y - k * (tamano + 3),
        size: tamano,
        font: fuente,
        color: COLOR.texto,
      }),
    );
    estado.columnas.forEach((c, i) => {
      const valor = fila.valores?.[i];
      if (valor === undefined || valor === "") return;
      const texto = c.tipo === "dinero" && /^-?\d+(\.\d+)?$/.test(valor) ? formatoMonto(valor) : valor;
      const x = CARTA.margen + anchoConcepto + anchoValor * (i + 1) - 4;
      textoDerecha(l.pagina, texto, x, l.y, fuente, tamano);
    });
    l.y -= alto;
  }

  // Espacio para la firma visible (que dibuja la firma digital en la parte baja de la última página)
  if (l.y < CARTA.margen + ALTO_FIRMA) nuevaPagina();
  return pdf.save();
}
