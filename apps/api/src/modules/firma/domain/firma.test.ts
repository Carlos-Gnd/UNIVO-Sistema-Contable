import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  certificadoValido,
  crearAutoridad,
  crearP12,
  datosCertificado,
  emitirCertificado,
  FirmaSinSecretoError,
  NOMBRE_AUTORIDAD,
  secretoFirma,
  descifrarClave,
  type CertificadoGuardado,
} from "./certificados.js";
import { firmarJws, verificarJws } from "./jws.js";
import { firmarPdf, huellaArchivo, verificarPdf } from "./pdf-firmado.js";

const SECRETO = "secreto-de-pruebas-con-mas-de-32-caracteres";

let autoridad: CertificadoGuardado;
let certificado: CertificadoGuardado;

beforeAll(() => {
  autoridad = crearAutoridad(SECRETO);
  certificado = emitirCertificado(
    autoridad,
    { nombre: "José Núñez Peña", organizacion: "CheroPhonex", correo: "jose@cherophonex.test" },
    SECRETO,
  );
});

async function pdfDePrueba(texto = "Balance general al 31 de octubre de 2026"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([612, 792]);
  pagina.drawText(texto, { x: 48, y: 700, size: 14, font: await pdf.embedFont(StandardFonts.Helvetica) });
  return pdf.save();
}

describe("autoridad certificadora simulada", () => {
  it("exige un FIRMA_SECRETO de al menos 32 caracteres", () => {
    expect(() => secretoFirma({})).toThrow(FirmaSinSecretoError);
    expect(() => secretoFirma({ FIRMA_SECRETO: "corto" })).toThrow(FirmaSinSecretoError);
    expect(secretoFirma({ FIRMA_SECRETO: SECRETO })).toBe(SECRETO);
  });

  it("emite un certificado por titular firmado por la autoridad, con nombres en español", () => {
    const datos = datosCertificado(certificado.certificadoPem);
    expect(datos.titular).toBe("José Núñez Peña");
    expect(datos.emisor).toBe(NOMBRE_AUTORIDAD);
    expect(datos.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(certificado.validoHasta.getTime()).toBeGreaterThan(certificado.validoDesde.getTime());
    expect(certificadoValido(certificado.certificadoPem, autoridad.certificadoPem)).toBe(true);
  });

  it("no reconoce un certificado de otra autoridad ni uno vencido", () => {
    const otra = crearAutoridad(SECRETO);
    expect(certificadoValido(certificado.certificadoPem, otra.certificadoPem)).toBe(false);
    const en2040 = new Date("2040-01-01T00:00:00Z");
    expect(certificadoValido(certificado.certificadoPem, autoridad.certificadoPem, en2040)).toBe(false);
  });

  it("guarda la llave privada cifrada: sin el secreto no se puede usar", () => {
    expect(certificado.clavePrivadaCifrada).toContain("ENCRYPTED PRIVATE KEY");
    expect(() =>
      descifrarClave(certificado.clavePrivadaCifrada, "otro-secreto-que-no-es-el-correcto"),
    ).toThrow();
  });
});

describe("firma JWS de los DTE", () => {
  const dte = { identificacion: { codigoGeneracion: "ABC" }, resumen: { totalPagar: 113 } };

  it("firma con RS512 y la verificación devuelve el mismo documento", () => {
    const jws = firmarJws(dte, descifrarClave(certificado.clavePrivadaCifrada, SECRETO));
    expect(jws.split(".")).toHaveLength(3);
    expect(JSON.parse(Buffer.from(jws.split(".")[0]!, "base64url").toString())).toMatchObject({
      alg: "RS512",
    });
    expect(verificarJws(jws, certificado.certificadoPem)).toEqual(dte);
  });

  it("un cambio al documento invalida la firma", () => {
    const jws = firmarJws(dte, descifrarClave(certificado.clavePrivadaCifrada, SECRETO));
    const [h, , f] = jws.split(".");
    const alterado = Buffer.from(JSON.stringify({ ...dte, resumen: { totalPagar: 1 } })).toString(
      "base64url",
    );
    expect(verificarJws(`${h}.${alterado}.${f}`, certificado.certificadoPem)).toBeNull();
    expect(verificarJws("no-es-un-jws", certificado.certificadoPem)).toBeNull();
  });

  it("la firma no se verifica con el certificado de otro titular", () => {
    const otro = emitirCertificado(autoridad, { nombre: "Otra empresa", organizacion: "Otra" }, SECRETO);
    const jws = firmarJws(dte, descifrarClave(certificado.clavePrivadaCifrada, SECRETO));
    expect(verificarJws(jws, otro.certificadoPem)).toBeNull();
  });
});

describe("firma PAdES de los estados financieros", () => {
  const visible = {
    firmante: "José Núñez Peña",
    cargo: "Contador",
    empresa: "CheroPhonex",
    firmadoEn: new Date("2026-11-30T15:00:00Z"),
    codigoVerificacion: "K7Q2-9XMB-4TRA",
    urlVerificacion: "http://localhost:5173/verificar/K7Q2-9XMB-4TRA",
  };

  it("firma el PDF y la verificación lo reconoce como íntegro y firmado por el titular", async () => {
    const { p12, clave } = crearP12(certificado, autoridad.certificadoPem, SECRETO);
    const firmado = await firmarPdf(await pdfDePrueba(), visible, { p12, clave });
    expect(firmado.subarray(0, 5).toString()).toBe("%PDF-");
    expect(firmado.toString("latin1")).toContain("/ETSI.CAdES.detached");

    const r = verificarPdf(firmado, autoridad.certificadoPem);
    expect(r).toMatchObject({ firmado: true, integro: true, firmaValida: true, cubreTodo: true });
    expect(r.certificado?.titular).toBe("José Núñez Peña");
    expect(r.certificado?.huella).toBe(certificado.huella);
  });

  it("un cambio a un byte firmado lo hace no íntegro", async () => {
    const { p12, clave } = crearP12(certificado, autoridad.certificadoPem, SECRETO);
    const firmado = await firmarPdf(await pdfDePrueba(), visible, { p12, clave });
    // Se cambia un byte del primer flujo de contenido (dentro de lo firmado)
    const alterado = Buffer.from(firmado);
    const i = alterado.indexOf("stream") + 20;
    expect(i).toBeGreaterThan(20);
    alterado[i] = alterado[i]! ^ 0xff;
    expect(huellaArchivo(alterado)).not.toBe(huellaArchivo(firmado));
    expect(verificarPdf(alterado, autoridad.certificadoPem)).toMatchObject({ firmado: true, integro: false });
  });

  it("un PDF sin firmar o firmado por otra autoridad no es válido", async () => {
    expect(verificarPdf(Buffer.from(await pdfDePrueba()), autoridad.certificadoPem).firmado).toBe(false);
    const { p12, clave } = crearP12(certificado, autoridad.certificadoPem, SECRETO);
    const firmado = await firmarPdf(await pdfDePrueba(), visible, { p12, clave });
    const otra = crearAutoridad(SECRETO);
    expect(verificarPdf(firmado, otra.certificadoPem)).toMatchObject({ integro: true, firmaValida: false });
  });
});

describe("PDF del estado financiero", () => {
  it("genera el estado con sus filas y deja la firma en la última página", async () => {
    const { estadoPdf, nuevoCodigoVerificacion, urlVerificacion } = await import("./estado-pdf.js");
    const codigo = nuevoCodigoVerificacion();
    expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(urlVerificacion(codigo, "https://web.test/")).toBe(`https://web.test/verificar/${codigo}`);

    const filas = Array.from({ length: 90 }, (_, i) => ({
      tipo: "renglon" as const,
      texto: `Cuenta ${i + 1}`,
      valores: [`${i * 100}.50`, "12.5 %"],
    }));
    const original = await estadoPdf(
      {
        titulo: "Estado de resultados",
        periodo: "Del 1 al 31 de octubre de 2026",
        columnas: [
          { titulo: "Monto", tipo: "dinero" },
          { titulo: "%", tipo: "texto" },
        ],
        filas: [
          { tipo: "seccion", texto: "Ingresos" },
          ...filas,
          { tipo: "resultado", texto: "Utilidad", valores: ["1.00", ""] },
        ],
      },
      { empresa: "CheroPhonex", nit: "1217-150890-101-2" },
    );
    const { p12, clave } = crearP12(certificado, autoridad.certificadoPem, SECRETO);
    const firmado = await firmarPdf(original, { ...visibleBase, codigoVerificacion: codigo }, { p12, clave });
    const pdf = await PDFDocument.load(firmado);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(verificarPdf(firmado, autoridad.certificadoPem)).toMatchObject({
      integro: true,
      firmaValida: true,
    });
  });
});

const visibleBase = {
  firmante: "José Núñez Peña",
  cargo: "Contador",
  empresa: "CheroPhonex",
  firmadoEn: new Date("2026-11-30T15:00:00Z"),
  urlVerificacion: "http://localhost:5173/verificar/X",
};
