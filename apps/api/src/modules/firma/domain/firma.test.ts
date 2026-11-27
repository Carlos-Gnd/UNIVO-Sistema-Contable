import { beforeAll, describe, expect, it } from "vitest";
import {
  certificadoValido,
  crearAutoridad,
  datosCertificado,
  emitirCertificado,
  FirmaSinSecretoError,
  NOMBRE_AUTORIDAD,
  secretoFirma,
  descifrarClave,
  type CertificadoGuardado,
} from "./certificados.js";
import { firmarJws, verificarJws } from "./jws.js";

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
