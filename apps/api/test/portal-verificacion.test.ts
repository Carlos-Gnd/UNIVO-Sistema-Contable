// S4-T36 (HU-88): el portal público de verificación confirma un estado firmado y rechaza uno alterado.
// Levanta el controlador del portal por HTTP con la firma real y el almacenamiento en memoria (sin PostgreSQL).
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { EstadoFirmadoVista, VerificacionEstado } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CasosFirma } from "../src/modules/firma/application/casos-firma.js";
import { REPOSITORIO_FIRMA } from "../src/modules/firma/domain/repositorio-firma.js";
import { VerificacionController } from "../src/modules/firma/infrastructure/http/firma.controller.js";
import {
  BALANCE,
  CONTADOR_ID,
  EMPRESA,
  EMPRESA_ID,
  RepositorioFirmaEnMemoria,
  conByteCambiado,
  rangosFirmados,
} from "./ayudas-firma";

let app: INestApplication;
let url: string;
let firma: EstadoFirmadoVista;
let pdf: Uint8Array;

async function consultar(codigo: string) {
  const r = await fetch(`${url}/verificacion/${encodeURIComponent(codigo)}`);
  return { status: r.status, cuerpo: (await r.json()) as VerificacionEstado & Record<string, unknown> };
}

async function subir(codigo: string, archivo: Uint8Array | null, nombre = "estado.pdf") {
  const datos = new FormData();
  if (archivo)
    datos.append("archivo", new Blob([new Uint8Array(archivo)], { type: "application/pdf" }), nombre);
  const r = await fetch(`${url}/verificacion/${encodeURIComponent(codigo)}`, { method: "POST", body: datos });
  return { status: r.status, cuerpo: (await r.json()) as VerificacionEstado & Record<string, unknown> };
}

beforeAll(async () => {
  process.env["WEB_URL"] = "https://contable.test";
  const repositorio = new RepositorioFirmaEnMemoria();
  const modulo = await Test.createTestingModule({
    controllers: [VerificacionController],
    providers: [CasosFirma, { provide: REPOSITORIO_FIRMA, useValue: repositorio }],
  }).compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();

  const r = await modulo.get(CasosFirma).firmar(CONTADOR_ID, EMPRESA_ID, BALANCE);
  firma = r.vista;
  pdf = r.pdf;
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe("el portal confirma un estado firmado (S4-T36)", () => {
  it("con el código muestra quién firmó, cuándo y con qué certificado, sin juzgar ningún archivo", async () => {
    const r = await consultar(firma.codigoVerificacion);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      codigoVerificacion: firma.codigoVerificacion,
      empresa: EMPRESA.nombre,
      nit: EMPRESA.nit,
      titulo: "Balance general",
      periodo: "Al 31 de octubre de 2026",
      firmante: "María José Núñez",
      cargo: "Contador",
      firmadoEn: firma.firmadoEn,
      huellaDocumento: firma.huellaDocumento,
      integro: null,
      archivo: null,
      certificado: {
        titular: "María José Núñez",
        emisor: expect.stringContaining("Autoridad Certificadora Simulada"),
      },
    });
    expect(new Date(r.cuerpo.certificado.validoHasta).getTime()).toBeGreaterThan(Date.now());
  });

  it("acepta el código en minúsculas y con espacios, como se escribe a mano", async () => {
    const r = await consultar(` ${firma.codigoVerificacion.toLowerCase()} `);
    expect(r.status).toBe(200);
    expect(r.cuerpo.codigoVerificacion).toBe(firma.codigoVerificacion);
  });

  it("no expone la llave, el certificado en PEM ni el PDF", async () => {
    const texto = JSON.stringify((await consultar(firma.codigoVerificacion)).cuerpo);
    expect(texto).not.toMatch(/PRIVATE KEY|BEGIN CERTIFICATE|certificadoPem|clave|%PDF/);
  });

  it("confirma como íntegro el PDF firmado tal como se descargó", async () => {
    const r = await subir(firma.codigoVerificacion, pdf);
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      codigoVerificacion: firma.codigoVerificacion,
      firmante: "María José Núñez",
      integro: true,
      archivo: { huella: firma.huellaDocumento, firmaValida: true, coincideHuella: true },
    });
  });

  it("el nombre con el que se sube el archivo no importa", async () => {
    const r = await subir(firma.codigoVerificacion, pdf, "Balance renombrado (copia).pdf");
    expect(r.cuerpo.integro).toBe(true);
  });
});

describe("el portal rechaza un estado alterado (S4-T36)", () => {
  it("un byte cambiado en el contenido firmado", async () => {
    const [inicio] = rangosFirmados(pdf);
    const r = await subir(
      firma.codigoVerificacion,
      conByteCambiado(pdf, Buffer.from(pdf).indexOf("stream", inicio) + 20),
    );
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      integro: false,
      archivo: { firmaValida: false, coincideHuella: false },
    });
    // Aun así informa a quién pertenece el código, para comparar con lo que se recibió
    expect(r.cuerpo.firmante).toBe("María José Núñez");
  });

  it("contenido agregado al final después de firmar", async () => {
    const agregado = Buffer.concat([Buffer.from(pdf), Buffer.from("\n% agregado después de firmar\n")]);
    const r = await subir(firma.codigoVerificacion, agregado);
    expect(r.cuerpo).toMatchObject({
      integro: false,
      archivo: { firmaValida: false, coincideHuella: false },
    });
  });

  it("el archivo recortado", async () => {
    const r = await subir(firma.codigoVerificacion, Buffer.from(pdf).subarray(0, Math.floor(pdf.length / 2)));
    expect(r.cuerpo.integro).toBe(false);
  });

  it("un archivo que no es PDF no rompe el portal: solo no es íntegro", async () => {
    const r = await subir(firma.codigoVerificacion, Buffer.from("Balance general\nTotal activo 20,800.50\n"));
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      integro: false,
      archivo: { firmaValida: false, coincideHuella: false },
    });
  });

  it("pide el archivo si no se adjunta", async () => {
    const r = await subir(firma.codigoVerificacion, null);
    expect(r.status).toBe(400);
  });

  it("responde 404 a un código inexistente, también al subir un archivo", async () => {
    expect((await consultar("AAAA-BBBB-CCCC")).status).toBe(404);
    expect((await subir("AAAA-BBBB-CCCC", pdf)).status).toBe(404);
  });

  it("responde 400 a un código mal formado o con letras confundibles", async () => {
    expect((await consultar("no-es-un-codigo")).status).toBe(400);
    // Sin O, I, 0 ni 1
    expect((await consultar("OOOO-IIII-0101")).status).toBe(400);
    expect((await subir("no-es-un-codigo", pdf)).status).toBe(400);
  });
});
