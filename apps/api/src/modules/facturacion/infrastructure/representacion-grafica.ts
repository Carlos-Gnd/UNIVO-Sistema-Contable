import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { DteVista } from "@contable/shared";
import {
  CARTA,
  COLOR,
  formatoMonto,
  partirTexto,
  qrPng,
  textoDerecha,
  textoPdf,
} from "../../firma/domain/pdf-utilidades.js";

/**
 * Representación gráfica del DTE (HU-56, S4-T13): el documento impreso que se entrega al cliente, con los datos del
 * emisor y del receptor, el detalle, los totales, el código de generación, el número de control, el sello de
 * recepción y el QR de la consulta pública de Hacienda.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

interface Lienzo {
  pdf: PDFDocument;
  pagina: PDFPage;
  y: number;
  fuente: PDFFont;
  negrita: PDFFont;
}

const ANCHO_UTIL = CARTA.ancho - CARTA.margen * 2;

function nuevaPagina(l: Lienzo): void {
  l.pagina = l.pdf.addPage([CARTA.ancho, CARTA.alto]);
  l.y = CARTA.alto - CARTA.margen;
}

function asegurar(l: Lienzo, alto: number): void {
  if (l.y - alto < CARTA.margen + 30) nuevaPagina(l);
}

function linea(
  l: Lienzo,
  texto: string,
  opciones: {
    tamano?: number;
    negrita?: boolean;
    color?: typeof COLOR.texto;
    x?: number;
    ancho?: number;
  } = {},
): void {
  const tamano = opciones.tamano ?? 8;
  const fuente = opciones.negrita ? l.negrita : l.fuente;
  for (const t of partirTexto(texto, fuente, tamano, opciones.ancho ?? ANCHO_UTIL)) {
    asegurar(l, tamano + 3);
    l.pagina.drawText(t, {
      x: opciones.x ?? CARTA.margen,
      y: l.y,
      size: tamano,
      font: fuente,
      color: opciones.color ?? COLOR.texto,
    });
    l.y -= tamano + 3;
  }
}

/** Recuadro con título y pares etiqueta: valor en una o dos columnas. */
function bloque(l: Lienzo, titulo: string, pares: [string, string][], columnas: 1 | 2 = 2): void {
  const filas = Math.ceil(pares.length / columnas);
  const alto = 18 + filas * 12;
  asegurar(l, alto + 8);
  const arriba = l.y;
  l.pagina.drawRectangle({
    x: CARTA.margen,
    y: arriba - alto,
    width: ANCHO_UTIL,
    height: alto,
    borderColor: COLOR.linea,
    borderWidth: 0.8,
  });
  l.pagina.drawText(textoPdf(titulo.toUpperCase()), {
    x: CARTA.margen + 8,
    y: arriba - 12,
    size: 7.5,
    font: l.negrita,
    color: COLOR.marca,
  });
  const mitad = ANCHO_UTIL / columnas;
  pares.forEach(([etiqueta, valor], i) => {
    const x = CARTA.margen + 8 + (i % columnas) * mitad;
    const y = arriba - 26 - Math.floor(i / columnas) * 12;
    const e = textoPdf(`${etiqueta}: `);
    l.pagina.drawText(e, { x, y, size: 7.5, font: l.negrita, color: COLOR.suave });
    const ancho = mitad - 16 - l.negrita.widthOfTextAtSize(e, 7.5);
    const v = partirTexto(valor || "—", l.fuente, 7.5, ancho)[0] ?? "";
    l.pagina.drawText(v, {
      x: x + l.negrita.widthOfTextAtSize(e, 7.5),
      y,
      size: 7.5,
      font: l.fuente,
      color: COLOR.texto,
    });
  });
  l.y = arriba - alto - 10;
}

const COLUMNAS = [
  { titulo: "Cant.", ancho: 42, derecha: true },
  { titulo: "Descripción", ancho: 196, derecha: false },
  { titulo: "Precio unit.", ancho: 68, derecha: true },
  { titulo: "No sujetas", ancho: 60, derecha: true },
  { titulo: "Exentas", ancho: 60, derecha: true },
  { titulo: "Gravadas", ancho: 90, derecha: true },
] as const;

function filaTabla(l: Lienzo, celdas: string[], negrita: boolean, fondo: boolean): void {
  const fuente = negrita ? l.negrita : l.fuente;
  const descripcion = partirTexto(celdas[1] ?? "", fuente, 7.5, COLUMNAS[1].ancho - 6);
  const alto = Math.max(1, descripcion.length) * 10 + 6;
  asegurar(l, alto);
  if (fondo) {
    l.pagina.drawRectangle({
      x: CARTA.margen,
      y: l.y - alto + 8,
      width: ANCHO_UTIL,
      height: alto,
      color: COLOR.fondo,
    });
  }
  let x = CARTA.margen;
  COLUMNAS.forEach((c, i) => {
    if (i === 1) {
      descripcion.forEach((t, k) =>
        l.pagina.drawText(t, { x: x + 3, y: l.y - k * 10, size: 7.5, font: fuente, color: COLOR.texto }),
      );
    } else if (c.derecha) {
      textoDerecha(l.pagina, celdas[i] ?? "", x + c.ancho - 3, l.y, fuente, 7.5);
    }
    x += c.ancho;
  });
  l.y -= alto;
  l.pagina.drawLine({
    start: { x: CARTA.margen, y: l.y + 6 },
    end: { x: CARTA.margen + ANCHO_UTIL, y: l.y + 6 },
    thickness: 0.4,
    color: COLOR.linea,
  });
}

function total(l: Lienzo, etiqueta: string, valor: number, destacado = false): void {
  asegurar(l, 12);
  const fuente = destacado ? l.negrita : l.fuente;
  const derecha = CARTA.margen + ANCHO_UTIL - 3;
  textoDerecha(l.pagina, etiqueta, derecha - 90, l.y, fuente, destacado ? 9 : 8, COLOR.suave);
  textoDerecha(l.pagina, formatoMonto(valor), derecha, l.y, fuente, destacado ? 9 : 8);
  l.y -= destacado ? 14 : 11;
}

export async function representacionGrafica(dte: DteVista): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(textoPdf(`${dte.nombreTipo} ${dte.numeroControl}`));
  pdf.setProducer("Sistema Contable UNIVO");
  const l: Lienzo = {
    pdf,
    pagina: pdf.addPage([CARTA.ancho, CARTA.alto]),
    y: CARTA.alto - CARTA.margen,
    fuente: await pdf.embedFont(StandardFonts.Helvetica),
    negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const doc = dte.documento;
  const emisor = obj(doc["emisor"]);
  const direccionEmisor = obj(emisor["direccion"]);
  const receptor = obj(doc["receptor"]);
  const resumen = obj(doc["resumen"]);
  const cuerpo = Array.isArray(doc["cuerpoDocumento"]) ? (doc["cuerpoDocumento"] as Json[]) : [];
  const esFactura = dte.tipoDte === "01";

  // Encabezado: emisor a la izquierda, QR a la derecha
  const qr = await pdf.embedPng(await qrPng(dte.enlaceConsulta));
  const ladoQr = 86;
  l.pagina.drawImage(qr, {
    x: CARTA.ancho - CARTA.margen - ladoQr,
    y: l.y - ladoQr + 8,
    width: ladoQr,
    height: ladoQr,
  });
  const anchoEmisor = ANCHO_UTIL - ladoQr - 16;
  linea(l, txt(emisor["nombre"]), { tamano: 12, negrita: true, ancho: anchoEmisor });
  if (emisor["nombreComercial"])
    linea(l, txt(emisor["nombreComercial"]), { tamano: 9, ancho: anchoEmisor, color: COLOR.suave });
  linea(l, `NIT ${txt(emisor["nit"])} · NRC ${txt(emisor["nrc"])}`, { ancho: anchoEmisor });
  linea(l, `Actividad: ${txt(emisor["descActividad"])}`, { ancho: anchoEmisor, color: COLOR.suave });
  linea(l, txt(direccionEmisor["complemento"]), { ancho: anchoEmisor, color: COLOR.suave });
  linea(l, `Tel. ${txt(emisor["telefono"])} · ${txt(emisor["correo"])}`, {
    ancho: anchoEmisor,
    color: COLOR.suave,
  });
  l.y = Math.min(l.y, CARTA.alto - CARTA.margen - ladoQr - 4) - 6;

  linea(l, "DOCUMENTO TRIBUTARIO ELECTRÓNICO", { tamano: 8, negrita: true, color: COLOR.marca });
  l.y -= 6;
  linea(l, dte.nombreTipo.toUpperCase(), { tamano: 13, negrita: true });
  l.y -= 4;

  bloque(
    l,
    "Identificación",
    [
      ["Código de generación", dte.codigoGeneracion],
      ["Número de control", dte.numeroControl],
      ["Sello de recepción", dte.selloRecepcion],
      ["Fecha y hora de emisión", `${dte.fechaEmision} ${dte.horaEmision}`],
      ["Modelo de facturación y transmisión", "Previo · Normal"],
    ],
    1,
  );

  const nombreReceptor = txt(receptor["nombre"]) || "Consumidor final";
  const documentoReceptor = esFactura
    ? receptor["numDocumento"]
      ? `NIT ${txt(receptor["numDocumento"])}`
      : ""
    : `NIT ${txt(receptor["nit"])}`;
  bloque(l, "Receptor", [
    ["Nombre", nombreReceptor],
    ["Documento", documentoReceptor],
    ["NRC", txt(receptor["nrc"])],
    ["Actividad", txt(receptor["descActividad"])],
    ["Dirección", txt(obj(receptor["direccion"])["complemento"])],
    ["Correo", txt(receptor["correo"])],
  ]);

  if (dte.relacionado) {
    bloque(l, "Documento relacionado", [
      ["Comprobante de crédito fiscal", dte.relacionado.numeroControl],
      ["Código de generación", dte.relacionado.codigoGeneracion],
    ]);
  }

  // Detalle
  filaTabla(
    l,
    COLUMNAS.map((c) => c.titulo),
    true,
    true,
  );
  for (const item of cuerpo) {
    filaTabla(
      l,
      [
        String(num(item["cantidad"])),
        txt(item["descripcion"]),
        formatoMonto(num(item["precioUni"])),
        formatoMonto(num(item["ventaNoSuj"])),
        formatoMonto(num(item["ventaExenta"])),
        formatoMonto(num(item["ventaGravada"])),
      ],
      false,
      false,
    );
  }
  l.y -= 6;

  // Totales
  total(l, "Suma de ventas no sujetas", num(resumen["totalNoSuj"]));
  total(l, "Suma de ventas exentas", num(resumen["totalExenta"]));
  total(l, "Suma de ventas gravadas", num(resumen["totalGravada"]));
  if (esFactura) {
    total(l, "IVA incluido en el precio", num(resumen["totalIva"]));
  } else {
    const tributos = Array.isArray(resumen["tributos"]) ? (resumen["tributos"] as Json[]) : [];
    for (const t of tributos) total(l, txt(t["descripcion"]), num(t["valor"]));
  }
  if (num(resumen["ivaPerci1"]) > 0) total(l, "IVA percibido 1 %", num(resumen["ivaPerci1"]));
  if (num(resumen["ivaRete1"]) > 0) total(l, "IVA retenido 1 %", num(resumen["ivaRete1"]));
  total(l, "Monto total de la operación", num(resumen["montoTotalOperacion"]));
  total(l, "Total a pagar", num(resumen["totalPagar"] ?? resumen["montoTotalOperacion"]), true);
  l.y -= 4;
  linea(l, `Son: ${txt(resumen["totalLetras"])}`, { negrita: true });
  linea(l, `Condición de la operación: ${num(resumen["condicionOperacion"]) === 2 ? "Crédito" : "Contado"}`, {
    color: COLOR.suave,
  });
  const apendice = Array.isArray(doc["apendice"]) ? (doc["apendice"] as Json[]) : [];
  for (const a of apendice) linea(l, `${txt(a["etiqueta"])}: ${txt(a["valor"])}`, { color: COLOR.suave });

  if (dte.invalidacion) {
    l.y -= 6;
    linea(
      l,
      `DOCUMENTO INVALIDADO el ${dte.invalidacion.invalidadoEn.slice(0, 10)}: ${dte.invalidacion.motivo}`,
      {
        negrita: true,
        color: rgb(0.72, 0.11, 0.11),
      },
    );
  }

  // Pie y marca de invalidación en cada página
  for (const pagina of pdf.getPages()) {
    pagina.drawText(
      textoPdf(
        "Ambiente de pruebas: la transmisión a Hacienda y el sello de recepción son simulados. Consulte el documento con el código QR.",
      ),
      { x: CARTA.margen, y: CARTA.margen - 14, size: 6.5, font: l.fuente, color: COLOR.tenue },
    );
    if (dte.invalidacion) {
      pagina.drawText("INVALIDADO", {
        x: 120,
        y: 300,
        size: 72,
        font: l.negrita,
        color: rgb(0.85, 0.2, 0.2),
        opacity: 0.18,
        rotate: degrees(35),
      });
    }
  }
  return pdf.save();
}
