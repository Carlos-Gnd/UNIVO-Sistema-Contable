import { createHash, createPrivateKey, generateKeyPairSync, randomBytes } from "node:crypto";
import forge from "node-forge";

/**
 * Autoridad certificadora simulada (HU-87, S4-T31): emite el certificado de cada empresa (firma de DTE, HU-56) y de
 * cada usuario que firma estados financieros. No es una CA reconocida: los certificados solo valen dentro del sistema
 * y del portal de verificación. Las llaves privadas se guardan cifradas (PKCS#8 con AES-256) con FIRMA_SECRETO.
 */

/** Falta FIRMA_SECRETO (o es corto): sin él no se pueden proteger las llaves privadas. */
export class FirmaSinSecretoError extends Error {
  constructor() {
    super("El servidor no tiene configurado FIRMA_SECRETO (mínimo 32 caracteres) para la firma electrónica.");
  }
}

export const NOMBRE_AUTORIDAD = "Autoridad Certificadora Simulada - Sistema Contable UNIVO";
const ORGANIZACION_AUTORIDAD = "Sistema Contable UNIVO (ambiente de pruebas)";
const ANIOS_AUTORIDAD = 10;
const ANIOS_CERTIFICADO = 2;

export function secretoFirma(env: NodeJS.ProcessEnv = process.env): string {
  const secreto = env["FIRMA_SECRETO"];
  if (!secreto || secreto.length < 32) throw new FirmaSinSecretoError();
  return secreto;
}

/** Certificado con su llave privada cifrada, como se guarda en la base. */
export interface CertificadoGuardado {
  titular: string;
  numeroSerie: string;
  certificadoPem: string;
  clavePrivadaCifrada: string;
  /** SHA-256 del certificado en DER, en hexadecimal */
  huella: string;
  validoDesde: Date;
  validoHasta: Date;
}

/** Datos públicos del certificado que se muestran al usuario o en el portal de verificación. */
export interface DatosCertificado {
  titular: string;
  emisor: string;
  numeroSerie: string;
  huella: string;
  validoDesde: string;
  validoHasta: string;
}

/** Huella SHA-256 (hex) del certificado en DER. */
export function huellaCertificado(certificadoPem: string): string {
  const der = forge.asn1
    .toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(certificadoPem)))
    .getBytes();
  return createHash("sha256").update(Buffer.from(der, "binary")).digest("hex");
}

export function datosCertificado(certificadoPem: string): DatosCertificado {
  const c = forge.pki.certificateFromPem(certificadoPem);
  const cn = (a: forge.pki.Certificate["subject"]) => {
    const valor = String(a.getField("CN")?.value ?? "");
    try {
      return forge.util.decodeUtf8(valor);
    } catch {
      return valor;
    }
  };
  return {
    titular: cn(c.subject),
    emisor: cn(c.issuer),
    numeroSerie: c.serialNumber.toUpperCase(),
    huella: huellaCertificado(certificadoPem),
    validoDesde: c.validity.notBefore.toISOString(),
    validoHasta: c.validity.notAfter.toISOString(),
  };
}

/** Llave privada descifrada en PEM PKCS#1, el formato que entiende node-forge. */
export function descifrarClave(clavePrivadaCifrada: string, secreto: string): string {
  return createPrivateKey({ key: clavePrivadaCifrada, format: "pem", passphrase: secreto })
    .export({ type: "pkcs1", format: "pem" })
    .toString();
}

function parDeLlaves(secreto: string): { publica: forge.pki.PublicKey; cifrada: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publica: forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }).toString()),
    cifrada: privateKey
      .export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: secreto })
      .toString(),
  };
}

/** Número de serie aleatorio y positivo (el primer byte < 0x80 evita un entero negativo en DER). */
const numeroSerie = () => `1${randomBytes(15).toString("hex").slice(1)}`;

function sumarAnios(fecha: Date, anios: number): Date {
  const d = new Date(fecha);
  d.setUTCFullYear(d.getUTCFullYear() + anios);
  return d;
}

function guardado(cert: forge.pki.Certificate, cifrada: string): CertificadoGuardado {
  const pem = forge.pki.certificateToPem(cert);
  return {
    titular: String(cert.subject.getField("CN")?.value ?? ""),
    numeroSerie: cert.serialNumber.toUpperCase(),
    certificadoPem: pem,
    clavePrivadaCifrada: cifrada,
    huella: huellaCertificado(pem),
    validoDesde: cert.validity.notBefore,
    validoHasta: cert.validity.notAfter,
  };
}

/** Crea la autoridad certificadora: certificado raíz autofirmado y su llave. */
export function crearAutoridad(secreto: string, ahora: Date = new Date()): CertificadoGuardado {
  const { publica, cifrada } = parDeLlaves(secreto);
  const cert = forge.pki.createCertificate();
  cert.publicKey = publica;
  cert.serialNumber = numeroSerie();
  cert.validity.notBefore = ahora;
  cert.validity.notAfter = sumarAnios(ahora, ANIOS_AUTORIDAD);
  const nombre = [
    { name: "commonName", value: NOMBRE_AUTORIDAD },
    { name: "organizationName", value: ORGANIZACION_AUTORIDAD },
    { name: "countryName", value: "SV" },
  ];
  cert.setSubject(nombre);
  cert.setIssuer(nombre);
  cert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(forge.pki.privateKeyFromPem(descifrarClave(cifrada, secreto)), forge.md.sha256.create());
  return guardado(cert, cifrada);
}

export interface TitularCertificado {
  /** Nombre del firmante (usuario) o razón social (empresa) */
  nombre: string;
  /** Empresa a la que pertenece el certificado */
  organizacion: string;
  /** NIT de la empresa, para el sello de los DTE */
  nit?: string;
  correo?: string;
}

/** Emite un certificado de firma para una empresa o un usuario, firmado por la autoridad. */
export function emitirCertificado(
  autoridad: Pick<CertificadoGuardado, "certificadoPem" | "clavePrivadaCifrada">,
  titular: TitularCertificado,
  secreto: string,
  ahora: Date = new Date(),
): CertificadoGuardado {
  const ca = forge.pki.certificateFromPem(autoridad.certificadoPem);
  const { publica, cifrada } = parDeLlaves(secreto);
  const cert = forge.pki.createCertificate();
  cert.publicKey = publica;
  cert.serialNumber = numeroSerie();
  cert.validity.notBefore = ahora;
  const vence = sumarAnios(ahora, ANIOS_CERTIFICADO);
  // Un certificado no puede durar más que su autoridad
  cert.validity.notAfter = vence > ca.validity.notAfter ? ca.validity.notAfter : vence;
  // Con valueTagClass UTF8, forge codifica el texto (tildes, ñ) como UTF8String
  const utf8 = forge.asn1.Type.UTF8 as never;
  const atributos: forge.pki.CertificateField[] = [
    { name: "commonName", value: titular.nombre.slice(0, 64), valueTagClass: utf8 },
    { name: "organizationName", value: titular.organizacion.slice(0, 64), valueTagClass: utf8 },
    { name: "countryName", value: "SV" },
  ];
  if (titular.nit) atributos.push({ name: "serialNumber", value: titular.nit });
  cert.setSubject(atributos);
  cert.setIssuer(ca.subject.attributes);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true, critical: true },
    { name: "extKeyUsage", emailProtection: true },
    ...(titular.correo ? [{ name: "subjectAltName", altNames: [{ type: 1, value: titular.correo }] }] : []),
  ]);
  cert.sign(
    forge.pki.privateKeyFromPem(descifrarClave(autoridad.clavePrivadaCifrada, secreto)),
    forge.md.sha256.create(),
  );
  return guardado(cert, cifrada);
}

/** El certificado lo emitió la autoridad y está vigente en la fecha dada. */
export function certificadoValido(
  certificadoPem: string,
  autoridadPem: string,
  en: Date = new Date(),
): boolean {
  try {
    const cert = forge.pki.certificateFromPem(certificadoPem);
    const ca = forge.pki.certificateFromPem(autoridadPem);
    return ca.verify(cert) && cert.validity.notBefore <= en && en <= cert.validity.notAfter;
  } catch {
    return false;
  }
}

/** Contenedor PKCS#12 (certificado, cadena y llave) que usa el firmante de PDF; la clave es de un solo uso. */
export function crearP12(
  certificado: Pick<CertificadoGuardado, "certificadoPem" | "clavePrivadaCifrada">,
  autoridadPem: string,
  secreto: string,
): { p12: Buffer; clave: string } {
  const clave = randomBytes(16).toString("hex");
  const asn1 = forge.pkcs12.toPkcs12Asn1(
    forge.pki.privateKeyFromPem(descifrarClave(certificado.clavePrivadaCifrada, secreto)),
    [forge.pki.certificateFromPem(certificado.certificadoPem), forge.pki.certificateFromPem(autoridadPem)],
    clave,
    { algorithm: "aes256" },
  );
  return { p12: Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary"), clave };
}
