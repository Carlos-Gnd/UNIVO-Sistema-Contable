import { createHash } from "node:crypto";
import forge from "node-forge";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import signpdf from "@signpdf/signpdf";
import { SUBFILTER_ETSI_CADES_DETACHED } from "@signpdf/utils";
import { certificadoValido, datosCertificado, type DatosCertificado } from "./certificados.js";
import { COLOR, partirTexto, qrPng, textoPdf } from "./pdf-utilidades.js";

/**
 * Firma PAdES de un PDF (HU-87, S4-T31): se dibuja la firma visible con el QR de verificación en la última página y
 * se incrusta una firma CMS separada (subfiltro ETSI.CAdES.detached) con el certificado del firmante. Cualquier
 * cambio posterior a los bytes firmados rompe la firma.
 */

export interface DatosFirmaVisible {
  firmante: string;
  cargo: string;
  empresa: string;
  firmadoEn: Date;
  codigoVerificacion: string;
  urlVerificacion: string;
}

export interface Firmante {
  p12: Buffer;
  clave: string;
}

const ANCHO_SELLO = 300;
const ALTO_SELLO = 92;

const fechaHora = (d: Date) =>
  d.toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
    dateStyle: "long",
    timeStyle: "short",
  });

/** Dibuja el recuadro de la firma visible y devuelve su rectángulo [x1, y1, x2, y2]. */
async function dibujarSello(pdf: PDFDocument, datos: DatosFirmaVisible): Promise<number[]> {
  const paginas = pdf.getPages();
  const pagina = paginas[paginas.length - 1]!;
  const { width } = pagina.getSize();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qr = await pdf.embedPng(await qrPng(datos.urlVerificacion));

  const x = width - 48 - ANCHO_SELLO;
  const y = 40;
  pagina.drawRectangle({
    x,
    y,
    width: ANCHO_SELLO,
    height: ALTO_SELLO,
    borderColor: COLOR.marca,
    borderWidth: 1,
    color: COLOR.fondo,
  });
  const lado = ALTO_SELLO - 12;
  pagina.drawImage(qr, { x: x + 6, y: y + 6, width: lado, height: lado });

  const tx = x + lado + 14;
  const anchoTexto = ANCHO_SELLO - lado - 20;
  let ty = y + ALTO_SELLO - 16;
  const escribir = (texto: string, tamano: number, negrita_ = false, color = COLOR.texto) => {
    for (const linea of partirTexto(texto, negrita_ ? negrita : fuente, tamano, anchoTexto).slice(0, 2)) {
      pagina.drawText(linea, { x: tx, y: ty, size: tamano, font: negrita_ ? negrita : fuente, color });
      ty -= tamano + 3;
    }
  };
  escribir("Firmado digitalmente por", 7, false, COLOR.tenue);
  escribir(datos.firmante, 9, true);
  escribir(datos.cargo, 7, false, COLOR.suave);
  escribir(fechaHora(datos.firmadoEn), 7, false, COLOR.suave);
  escribir(`Verificación: ${datos.codigoVerificacion}`, 7, true, COLOR.marca);
  return [x, y, x + ANCHO_SELLO, y + ALTO_SELLO];
}

/** Agrega la firma visible y la firma digital PAdES al PDF; devuelve el PDF firmado. */
export async function firmarPdf(
  original: Uint8Array,
  datos: DatosFirmaVisible,
  firmante: Firmante,
): Promise<Buffer> {
  const pdf = await PDFDocument.load(original);
  pdf.setProducer("Sistema Contable UNIVO");
  pdf.setModificationDate(datos.firmadoEn);
  const rect = await dibujarSello(pdf, datos);
  const paginas = pdf.getPages();
  pdflibAddPlaceholder({
    pdfDoc: pdf,
    pdfPage: paginas[paginas.length - 1]!,
    reason: textoPdf(`Firma de estados financieros de ${datos.empresa}`),
    contactInfo: textoPdf(datos.urlVerificacion),
    name: textoPdf(datos.firmante),
    location: "El Salvador",
    signingTime: datos.firmadoEn,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
    widgetRect: rect,
    appName: "Sistema Contable UNIVO",
    signatureLength: 16384,
  });
  // El firmador necesita la tabla de referencias clásica, sin flujos de objetos
  const conEspacio = Buffer.from(await pdf.save({ useObjectStreams: false }));
  return signpdf.sign(
    conEspacio,
    new P12Signer(firmante.p12, { passphrase: firmante.clave }),
    datos.firmadoEn,
  );
}

export interface ResultadoVerificacionPdf {
  /** El PDF trae una firma CMS que se pudo leer */
  firmado: boolean;
  /** Lo firmado coincide con el resumen guardado en la firma: el contenido no cambió */
  integro: boolean;
  /** La firma corresponde a la llave del certificado y este lo emitió la autoridad */
  firmaValida: boolean;
  /** La firma cubre todo el archivo: no se agregó nada después de firmar */
  cubreTodo: boolean;
  certificado: DatosCertificado | null;
}

const SIN_FIRMA: ResultadoVerificacionPdf = {
  firmado: false,
  integro: false,
  firmaValida: false,
  cubreTodo: false,
  certificado: null,
};

const OID_MESSAGE_DIGEST = forge.pki.oids["messageDigest"]!;

/** Última firma del PDF: los rangos firmados y el CMS en DER. */
function extraerFirma(pdf: Buffer): { rangos: number[]; cms: Buffer } | null {
  const texto = pdf.toString("latin1");
  const coincidencias = [...texto.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
  const ultima = coincidencias[coincidencias.length - 1];
  if (!ultima) return null;
  const rangos = ultima.slice(1, 5).map(Number);
  const [a, b, c] = rangos as [number, number, number, number];
  if (a !== 0 || b <= 0 || c <= b || c > pdf.length) return null;
  // Entre el fin del primer rango y el inicio del segundo está <...hex...>, rellenado con ceros al final
  const hex = texto.slice(b + 1, c - 1);
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  return { rangos, cms: Buffer.from(hex, "hex") };
}

/**
 * Verifica la firma PAdES de un PDF: que el resumen SHA-256 de los bytes firmados coincida con el de la firma, que la
 * firma de los atributos corresponda al certificado incluido y que la autoridad haya emitido ese certificado.
 */
export function verificarPdf(pdf: Buffer, autoridadPem: string): ResultadoVerificacionPdf {
  const firma = extraerFirma(pdf);
  if (!firma) return SIN_FIRMA;
  try {
    const [a, b, c, d] = firma.rangos as [number, number, number, number];
    const firmado = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
    const resumen = createHash("sha256").update(firmado).digest();

    // El relleno de ceros que sigue al CMS no es parte de él
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(firma.cms.toString("binary")), {
      strict: false,
      parseAllBytes: false,
    } as unknown as boolean);
    const mensaje = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData & {
      rawCapture: { authenticatedAttributes?: forge.asn1.Asn1[]; signature?: string };
    };
    const certificado = mensaje.certificates[0];
    const atributos = mensaje.rawCapture.authenticatedAttributes;
    const valorFirma = mensaje.rawCapture.signature;
    if (!certificado || !atributos || !valorFirma) return { ...SIN_FIRMA, firmado: true };

    // Atributo messageDigest: el resumen de lo firmado que guardó el firmante
    let resumenFirmado: string | null = null;
    for (const atributo of atributos) {
      const [oid, valores] = atributo.value as forge.asn1.Asn1[];
      if (forge.asn1.derToOid(oid!.value as string) === OID_MESSAGE_DIGEST) {
        resumenFirmado = ((valores!.value as forge.asn1.Asn1[])[0]!.value as string) ?? null;
      }
    }
    const integro = resumenFirmado !== null && Buffer.from(resumenFirmado, "binary").equals(resumen);

    // La firma se calcula sobre los atributos codificados como SET (no con la etiqueta [0] del SignerInfo)
    const conjunto = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, atributos);
    const md = forge.md.sha256.create();
    md.update(forge.asn1.toDer(conjunto).getBytes());
    const llave = certificado.publicKey as forge.pki.rsa.PublicKey;
    const pemCertificado = forge.pki.certificateToPem(certificado);
    const firmaValida =
      llave.verify(md.digest().bytes(), valorFirma) &&
      certificadoValido(pemCertificado, autoridadPem, new Date());

    return {
      firmado: true,
      integro,
      firmaValida,
      cubreTodo: c + d === pdf.length,
      certificado: datosCertificado(pemCertificado),
    };
  } catch {
    return { ...SIN_FIRMA, firmado: true };
  }
}

/** Huella SHA-256 (hex) de un archivo. */
export const huellaArchivo = (datos: Uint8Array) => createHash("sha256").update(datos).digest("hex");
