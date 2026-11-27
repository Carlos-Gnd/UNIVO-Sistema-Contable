import { createPublicKey, createSign, createVerify } from "node:crypto";

/**
 * Firma JWS compacta con RS512, la que pide el Ministerio de Hacienda para los DTE (HU-56, S4-T13):
 * BASE64URL(encabezado) . BASE64URL(documento JSON) . BASE64URL(firma).
 */

const ENCABEZADO = { alg: "RS512", typ: "JWS" } as const;

const base64url = (datos: Buffer | string) => Buffer.from(datos).toString("base64url");

export function firmarJws(documento: unknown, clavePrivadaPem: string): string {
  const entrada = `${base64url(JSON.stringify(ENCABEZADO))}.${base64url(JSON.stringify(documento))}`;
  const firma = createSign("RSA-SHA512").update(entrada).sign(clavePrivadaPem);
  return `${entrada}.${base64url(firma)}`;
}

/**
 * Documento contenido en el JWS si la firma corresponde a la llave pública del certificado; null si el JWS está
 * mal formado, usa otro algoritmo o fue alterado.
 */
export function verificarJws(jws: string, certificadoPem: string): unknown {
  const partes = jws.split(".");
  if (partes.length !== 3) return null;
  const [encabezado, cuerpo, firma] = partes as [string, string, string];
  try {
    const alg = (JSON.parse(Buffer.from(encabezado, "base64url").toString("utf8")) as { alg?: unknown }).alg;
    if (alg !== ENCABEZADO.alg) return null;
    const valida = createVerify("RSA-SHA512")
      .update(`${encabezado}.${cuerpo}`)
      .verify(createPublicKey(certificadoPem), Buffer.from(firma, "base64url"));
    return valida ? JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) : null;
  } catch {
    return null;
  }
}
