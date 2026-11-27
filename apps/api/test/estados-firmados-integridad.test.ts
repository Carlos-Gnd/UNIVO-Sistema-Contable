// S4-T33 (HU-87): un estado financiero firmado se verifica tal como se descargó y cualquier cambio lo invalida.
// No usa PostgreSQL: la firma, los certificados y la verificación son los reales y el almacenamiento está en memoria.
import type { EstadoFirmadoVista } from "@contable/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { CasosFirma } from "../src/modules/firma/application/casos-firma.js";
import { crearAutoridad, crearP12, emitirCertificado } from "../src/modules/firma/domain/certificados.js";
import { estadoPdf } from "../src/modules/firma/domain/estado-pdf.js";
import { firmarPdf, huellaArchivo, verificarPdf } from "../src/modules/firma/domain/pdf-firmado.js";
import {
  BALANCE,
  CONTADOR_ID,
  EMPRESA,
  EMPRESA_ID,
  GERENTE_ID,
  RepositorioFirmaEnMemoria,
  SECRETO_FIRMA,
  conByteCambiado,
  rangosFirmados,
} from "./ayudas-firma";

let repositorio: RepositorioFirmaEnMemoria;
let casos: CasosFirma;
let firma: EstadoFirmadoVista;
let pdf: Uint8Array;

/** Verifica el archivo contra el código de la firma del balance, como lo hace el portal. */
const verificar = (archivo: Uint8Array, codigo = firma.codigoVerificacion) =>
  casos.verificarArchivo(codigo, Buffer.from(archivo));

beforeAll(async () => {
  process.env["WEB_URL"] = "https://contable.test";
  repositorio = new RepositorioFirmaEnMemoria();
  casos = new CasosFirma(repositorio);
  const r = await casos.firmar(CONTADOR_ID, EMPRESA_ID, BALANCE);
  firma = r.vista;
  pdf = r.pdf;
}, 60_000);

describe("un estado firmado se verifica (S4-T33)", () => {
  it("el PDF que se descarga es exactamente el que se firmó y su huella es la registrada", async () => {
    const descargado = await casos.descargar(CONTADOR_ID, EMPRESA_ID, firma.id);
    expect(Buffer.from(descargado.pdf).equals(Buffer.from(pdf))).toBe(true);
    expect(huellaArchivo(descargado.pdf)).toBe(firma.huellaDocumento);
    expect(descargado.nombre).toBe(`balance-general-${firma.codigoVerificacion}.pdf`);
  });

  it("la firma PAdES es válida, la emitió la autoridad y cubre todo el archivo", () => {
    expect(verificarPdf(Buffer.from(pdf), repositorio.autoridad.certificadoPem)).toMatchObject({
      firmado: true,
      integro: true,
      firmaValida: true,
      cubreTodo: true,
      certificado: { titular: "María José Núñez" },
    });
  });

  it("el PDF recién firmado se confirma como íntegro con su código", async () => {
    const r = await verificar(pdf);
    expect(r).toMatchObject({
      codigoVerificacion: firma.codigoVerificacion,
      titulo: "Balance general",
      periodo: "Al 31 de octubre de 2026",
      firmante: "María José Núñez",
      cargo: "Contador",
      empresa: EMPRESA.nombre,
      nit: EMPRESA.nit,
      integro: true,
      archivo: { huella: firma.huellaDocumento, firmaValida: true, coincideHuella: true },
    });
  });

  it("verificarlo varias veces no cambia el resultado ni lo guardado", async () => {
    const primera = await verificar(pdf);
    const segunda = await verificar(pdf);
    expect(segunda).toEqual(primera);
    expect(repositorio.firmas).toHaveLength(1);
    expect(huellaArchivo(repositorio.firmas[0]!.pdf)).toBe(firma.huellaDocumento);
  });
});

describe("un cambio al estado firmado lo invalida (S4-T33)", () => {
  it("cambiar un byte del primer tramo firmado (el contenido del estado)", async () => {
    const [inicio, largo] = rangosFirmados(pdf);
    const i = Buffer.from(pdf).indexOf("stream", inicio) + 20;
    expect(i).toBeLessThan(inicio + largo);
    const r = await verificar(conByteCambiado(pdf, i));
    expect(r.integro).toBe(false);
    expect(r.archivo).toMatchObject({ firmaValida: false, coincideHuella: false });
  });

  it("cambiar un byte del segundo tramo firmado (lo que sigue a la firma)", async () => {
    const [, , inicio2, largo2] = rangosFirmados(pdf);
    const r = await verificar(conByteCambiado(pdf, inicio2 + Math.floor(largo2 / 2)));
    expect(r.integro).toBe(false);
    expect(r.archivo).toMatchObject({ firmaValida: false, coincideHuella: false });
  });

  it("cambiar un byte de la firma misma", async () => {
    const [, largo1, inicio2] = rangosFirmados(pdf);
    // El CMS va en hexadecimal entre < y >, rellenado con ceros: se cambia un dígito por otro dígito válido
    const i = largo1 + 40;
    expect(i).toBeLessThan(inicio2);
    const alterado = Buffer.from(pdf);
    alterado[i] = alterado[i] === 0x30 ? 0x31 : 0x30;
    const r = await verificar(alterado);
    expect(r.integro).toBe(false);
    expect(r.archivo?.firmaValida).toBe(false);
  });

  it("agregar contenido al final después de firmar (actualización incremental)", async () => {
    const agregado = Buffer.concat([
      Buffer.from(pdf),
      Buffer.from("\n% Cifra corregida después de firmar\n9999 0 obj\n(Total activo 99999.99)\nendobj\n"),
    ]);
    expect(verificarPdf(agregado, repositorio.autoridad.certificadoPem)).toMatchObject({
      integro: true,
      cubreTodo: false,
    });
    const r = await verificar(agregado);
    expect(r.integro).toBe(false);
    expect(r.archivo).toMatchObject({ firmaValida: false, coincideHuella: false });
  });

  it("recortar el archivo firmado", async () => {
    const r = await verificar(Buffer.from(pdf).subarray(0, pdf.length - 200));
    expect(r.integro).toBe(false);
    expect(r.archivo?.coincideHuella).toBe(false);
  });

  it("volver a firmar el estado con una cifra cambiada no pasa por el código original", async () => {
    const filas = BALANCE.filas.map((f) => (f.texto === "Inventarios" ? { ...f, valores: ["9300.50"] } : f));
    const otra = await casos.firmar(CONTADOR_ID, EMPRESA_ID, { ...BALANCE, filas });
    expect(otra.vista.codigoVerificacion).not.toBe(firma.codigoVerificacion);
    expect(otra.vista.huellaDocumento).not.toBe(firma.huellaDocumento);

    // Por sí solo el PDF nuevo es válido, pero no es el documento del código original
    expect((await verificar(otra.pdf, otra.vista.codigoVerificacion)).integro).toBe(true);
    const r = await verificar(otra.pdf);
    expect(r.integro).toBe(false);
    expect(r.archivo).toMatchObject({ firmaValida: true, coincideHuella: false });
  });

  it("el estado firmado por otro usuario de la empresa no pasa por el código del contador", async () => {
    const delGerente = await casos.firmar(GERENTE_ID, EMPRESA_ID, { ...BALANCE, cargo: "Gerente general" });
    expect(delGerente.vista.firmante).toBe("Carlos Ramírez");
    const r = await verificar(delGerente.pdf);
    expect(r.firmante).toBe("María José Núñez");
    expect(r.integro).toBe(false);
    // Su certificado es válido, pero no es el del firmante registrado con este código
    expect(r.archivo).toMatchObject({ firmaValida: false, coincideHuella: false });
  });

  it("una firma falsificada con otra autoridad no es válida aunque copie los datos visibles", async () => {
    const falsa = crearAutoridad(SECRETO_FIRMA);
    const certificado = emitirCertificado(
      falsa,
      { nombre: "María José Núñez", organizacion: EMPRESA.nombreComercial },
      SECRETO_FIRMA,
    );
    const original = await estadoPdf(BALANCE, { empresa: EMPRESA.nombre, nit: EMPRESA.nit });
    const falsificado = await firmarPdf(
      original,
      {
        firmante: firma.firmante,
        cargo: firma.cargo,
        empresa: EMPRESA.nombreComercial,
        firmadoEn: new Date(firma.firmadoEn),
        codigoVerificacion: firma.codigoVerificacion,
        urlVerificacion: firma.urlVerificacion,
      },
      crearP12(certificado, falsa.certificadoPem, SECRETO_FIRMA),
    );
    expect(verificarPdf(falsificado, falsa.certificadoPem).firmaValida).toBe(true);

    const r = await verificar(falsificado);
    expect(r.integro).toBe(false);
    expect(r.archivo).toMatchObject({ firmaValida: false, coincideHuella: false });
  });

  it("el estado sin firmar no se confirma", async () => {
    const sinFirma = await estadoPdf(BALANCE, { empresa: EMPRESA.nombre, nit: EMPRESA.nit });
    const r = await verificar(sinFirma);
    expect(r.integro).toBe(false);
    expect(r.archivo).toMatchObject({ firmaValida: false, coincideHuella: false });
  });

  it("ninguna verificación alterada cambia el PDF guardado: el original sigue siendo íntegro", async () => {
    expect((await verificar(pdf)).integro).toBe(true);
    const guardado = repositorio.firmas.find((f) => f.id === firma.id)!;
    expect(huellaArchivo(guardado.pdf)).toBe(firma.huellaDocumento);
  });
});
