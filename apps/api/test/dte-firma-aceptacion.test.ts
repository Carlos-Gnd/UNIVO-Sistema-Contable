// S4-T15 (HU-56): la firma del DTE se verifica y un cambio al documento la invalida. Se descarga el JSON firmado de un
// CCF y de una factura, se verifica con el certificado de la empresa y se comprueba que cualquier alteración del
// documento, de la firma, del algoritmo o del certificado hace que la verificación falle.
import type { DteVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { selloRecepcion } from "../src/modules/facturacion/domain/dte.js";
import {
  certificadoValido,
  crearAutoridad,
  datosCertificado,
  huellaCertificado,
} from "../src/modules/firma/domain/certificados.js";
import { verificarJws } from "../src/modules/firma/domain/jws.js";
import { CONSULTA, CONTADOR, iniciarSistemaDte, type SistemaDte } from "./ayudas-dte";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SECRETO = "secreto-de-pruebas-de-firma-con-mas-de-32-caracteres";

let s: SistemaDte;
let ccf: DteVista;
let factura: DteVista;
let certificadoPem: string;
let autoridadPem: string;
let descargado: Json;

const base64url = (texto: string) => Buffer.from(texto, "utf8").toString("base64url");
const deBase64url = (texto: string) => Buffer.from(texto, "base64url").toString("utf8");

/** El JSON descargado sin los campos que agrega la descarga (firma y sello). */
const documentoDe = (json: Json): Json => {
  const documento = { ...json };
  delete documento["firmaElectronica"];
  delete documento["selloRecibido"];
  return documento;
};

/** La firma corresponde al documento: lo que firmó es exactamente lo que trae el JSON. */
const firmaCorresponde = (json: Json, certificado = certificadoPem): boolean => {
  const firmado = verificarJws(json["firmaElectronica"], certificado);
  return firmado !== null && JSON.stringify(firmado) === JSON.stringify(documentoDe(json));
};

async function descargarJson(dteId: string): Promise<Json> {
  const r = await fetch(`${s.url}/empresas/${s.emp.empresaId}/dte/${dteId}/json`, {
    headers: { authorization: `Bearer ${CONSULTA}` },
  });
  expect(r.status).toBe(200);
  return (await r.json()) as Json;
}

/** Cambia una letra del texto por otra distinta. */
const alterar = (texto: string, posicion: number) =>
  texto.slice(0, posicion) + (texto[posicion] === "A" ? "B" : "A") + texto.slice(posicion + 1);

beforeAll(async () => {
  s = await iniciarSistemaDte("contable_api_dte_firma", "0614-010190-102-0");
  ccf = await s.emitir({
    tipoDocumento: "ccf",
    sucursalId: s.emp.sucursalId,
    terceroId: s.clientes.get("245871-3")!.id,
    condicionPago: "credito",
    lineas: [{ productoId: s.productoId, cantidad: 1, precioUnitario: 2740.5 }],
  });
  factura = await s.emitir({
    tipoDocumento: "factura",
    sucursalId: s.emp.sucursalId,
    condicionPago: "contado",
    cuentaPagoId: s.cajaId,
    lineas: [{ productoId: s.productoId, cantidad: 2, precioUnitario: 113 }],
  });
  certificadoPem = (
    await s.c.query(
      "select certificado_pem from certificados_firma where empresa_id = $1 and usuario_id is null and vigente",
      [s.emp.empresaId],
    )
  ).rows[0].certificado_pem as string;
  autoridadPem = (await s.c.query("select certificado_pem from autoridad_certificadora where id = 1")).rows[0]
    .certificado_pem as string;
  descargado = await descargarJson(ccf.id);
}, 90_000);

afterAll(async () => {
  await s?.cerrar();
});

describe("la firma de un DTE se verifica con el certificado de la empresa (S4-T15)", () => {
  it("el JWS tiene tres partes y declara RS512", () => {
    const partes = String(descargado["firmaElectronica"]).split(".");
    expect(partes).toHaveLength(3);
    expect(JSON.parse(deBase64url(partes[0]!))).toEqual({ alg: "RS512", typ: "JWS" });
  });

  it("lo que firmó es el documento: el contenido del JWS es el JSON del DTE", () => {
    expect(firmaCorresponde(descargado)).toBe(true);
    expect(verificarJws(descargado["firmaElectronica"], certificadoPem)).toMatchObject({
      identificacion: { numeroControl: ccf.numeroControl, codigoGeneracion: ccf.codigoGeneracion },
      resumen: { totalPagar: 3096.77 },
    });
  });

  it("el JSON descargado es el guardado y la API informa que la firma es válida", async () => {
    const guardado = (
      await s.c.query("select documento, firma from documentos_electronicos where id = $1", [ccf.id])
    ).rows[0];
    expect(documentoDe(descargado)).toEqual(guardado.documento);
    expect(descargado["firmaElectronica"]).toBe(guardado.firma);
    const vista = (await s.pedir("GET", `/dte/${ccf.id}`, CONSULTA)).cuerpo as unknown as DteVista & {
      firmaValida: boolean;
    };
    expect(vista.firmaValida).toBe(true);
  });

  it("cada DTE lleva su propia firma, hecha con el certificado de su empresa", async () => {
    expect(factura.firma).not.toBe(ccf.firma);
    const usados = (
      await s.c.query(
        `select distinct c.certificado_pem from documentos_electronicos d join certificados_firma c on c.id = d.certificado_id`,
      )
    ).rows;
    expect(usados).toHaveLength(1);
    expect(usados[0].certificado_pem).toBe(certificadoPem);
    expect(firmaCorresponde(await descargarJson(factura.id))).toBe(true);
  });

  it("sin sesión no se descarga el JSON", async () => {
    const sin = await fetch(`${s.url}/empresas/${s.emp.empresaId}/dte/${ccf.id}/json`);
    expect(sin.status).toBe(401);
  });
});

describe("un cambio al documento invalida la firma (S4-T15)", () => {
  it.each([
    ["el total a pagar", (j: Json) => (j["resumen"].totalPagar = 3096.78)],
    ["el IVA del tributo", (j: Json) => (j["resumen"].tributos[0].valor = 356.26)],
    ["la base gravada", (j: Json) => (j["resumen"].totalGravada = 2740.49)],
    ["el NRC del receptor", (j: Json) => (j["receptor"].nrc = "9999999")],
    ["el nombre del receptor", (j: Json) => (j["receptor"].nombre = "Otro cliente")],
    ["la fecha de emisión", (j: Json) => (j["identificacion"].fecEmi = "2026-01-01")],
    [
      "el número de control",
      (j: Json) => (j["identificacion"].numeroControl = "DTE-03-M0010001-000000000000099"),
    ],
    ["la cantidad de una línea", (j: Json) => (j["cuerpoDocumento"][0].cantidad = 2)],
    ["una propiedad agregada", (j: Json) => (j["observacion"] = "agregado")],
  ])("cambiar %s en el JSON ya no corresponde a lo firmado", (_nombre, cambiar) => {
    const alterado = structuredClone(descargado);
    expect(firmaCorresponde(alterado)).toBe(true);
    cambiar(alterado);
    expect(firmaCorresponde(alterado)).toBe(false);
  });

  it("cambiar el contenido dentro del JWS, aunque sea un monto, invalida la firma", () => {
    const [encabezado, cuerpo, firma] = String(descargado["firmaElectronica"]).split(".") as [
      string,
      string,
      string,
    ];
    const documento = JSON.parse(deBase64url(cuerpo)) as Json;
    documento["resumen"].totalPagar = 1;
    const falso = `${encabezado}.${base64url(JSON.stringify(documento))}.${firma}`;
    expect(verificarJws(falso, certificadoPem)).toBeNull();
  });

  it("alterar un solo carácter del contenido o de la firma la invalida", () => {
    const [encabezado, cuerpo, firma] = String(descargado["firmaElectronica"]).split(".") as [
      string,
      string,
      string,
    ];
    expect(verificarJws(`${encabezado}.${alterar(cuerpo, 20)}.${firma}`, certificadoPem)).toBeNull();
    expect(verificarJws(`${encabezado}.${cuerpo}.${alterar(firma, 10)}`, certificadoPem)).toBeNull();
    expect(verificarJws(`${encabezado}.${cuerpo}.${firma.slice(0, -4)}`, certificadoPem)).toBeNull();
    expect(verificarJws(`${encabezado}.${cuerpo}.`, certificadoPem)).toBeNull();
  });

  it("no acepta otro algoritmo: ni none ni HS256 con el mismo contenido y firma", () => {
    const [, cuerpo, firma] = String(descargado["firmaElectronica"]).split(".") as [string, string, string];
    for (const alg of ["none", "HS256", "RS256", "rs512"]) {
      const encabezado = base64url(JSON.stringify({ alg, typ: "JWS" }));
      expect(verificarJws(`${encabezado}.${cuerpo}.${firma}`, certificadoPem), alg).toBeNull();
    }
  });

  it("no acepta un JWS mal formado", () => {
    for (const malo of [
      "",
      "a.b",
      "a.b.c.d",
      "no-es-un-jws",
      "....",
      `${"x".repeat(50)}.${"y".repeat(50)}.${"z".repeat(50)}`,
    ]) {
      expect(verificarJws(malo, certificadoPem), malo).toBeNull();
    }
  });

  it("no se verifica con el certificado de otra autoridad ni con el de la autoridad misma", async () => {
    // Otro certificado emitido por la misma autoridad: no es el que firmó
    const otraAutoridad = crearAutoridad(SECRETO);
    expect(firmaCorresponde(descargado, otraAutoridad.certificadoPem)).toBe(false);
    expect(firmaCorresponde(descargado, autoridadPem)).toBe(false);
  });

  it("la base no deja cambiar el documento ni la firma de un DTE emitido", async () => {
    for (const cambio of [
      "documento = jsonb_set(documento, '{resumen,totalPagar}', '1')",
      "firma = firma || 'x'",
      "sello_recepcion = repeat('0', 40)",
      "total = 1",
    ]) {
      await expect(
        s.c.query(`update documentos_electronicos set ${cambio} where id = $1`, [ccf.id]),
        cambio,
      ).rejects.toThrow(/no se modifica/);
    }
    await expect(s.c.query("delete from documentos_electronicos where id = $1", [ccf.id])).rejects.toThrow(
      /no se borra/,
    );
  });
});

describe("el certificado y el sello de la firma (S4-T15)", () => {
  it("el certificado de la empresa lo emitió la autoridad y está vigente", () => {
    expect(certificadoValido(certificadoPem, autoridadPem)).toBe(true);
    const datos = datosCertificado(certificadoPem);
    expect(datos.emisor).toContain("Autoridad Certificadora Simulada");
    expect(datos.titular).toBe("CHERO PHONEX");
  });

  it("un certificado de otra autoridad, o ya vencido, no sirve", () => {
    expect(certificadoValido(certificadoPem, crearAutoridad(SECRETO).certificadoPem)).toBe(false);
    const vence = new Date(datosCertificado(certificadoPem).validoHasta);
    expect(
      certificadoValido(certificadoPem, autoridadPem, new Date(vence.getTime() + 24 * 3600 * 1000)),
    ).toBe(false);
    expect(certificadoValido(certificadoPem, autoridadPem, new Date("2000-01-01"))).toBe(false);
  });

  it("la huella guardada del certificado es la de su contenido", async () => {
    const guardada = (
      await s.c.query(
        "select huella from certificados_firma where empresa_id = $1 and usuario_id is null and vigente",
        [s.emp.empresaId],
      )
    ).rows[0].huella as string;
    expect(guardada.trim()).toBe(huellaCertificado(certificadoPem));
  });

  it("el sello de recepción se deriva de la firma: cambiarla cambia el sello", () => {
    const anio = ccf.fechaEmision.slice(0, 4);
    expect(selloRecepcion(anio, ccf.codigoGeneracion, ccf.firma ?? "", SECRETO)).toBe(ccf.selloRecepcion);
    expect(selloRecepcion(anio, ccf.codigoGeneracion, `${ccf.firma}x`, SECRETO)).not.toBe(ccf.selloRecepcion);
    expect(
      selloRecepcion(
        anio,
        ccf.codigoGeneracion,
        ccf.firma ?? "",
        "otro-secreto-de-al-menos-treinta-y-dos-caracteres",
      ),
    ).not.toBe(ccf.selloRecepcion);
  });
});

describe("la firma del evento de invalidación (S4-T15)", () => {
  it("el evento firmado se verifica, y alterarlo o cambiar el DTE original no afecta la firma del original", async () => {
    const invalidado = (await s.pedir("POST", `/dte/${factura.id}/invalidar`, CONTADOR, {
      motivo: "Error en la información del receptor",
      tipoInvalidacion: 1,
    })) as unknown as { status: number; cuerpo: DteVista & { firmaEvento?: string } };
    expect(invalidado.status).toBe(201);
    const guardado = (
      await s.c.query(
        "select firma, firma_invalidacion, evento_invalidacion from documentos_electronicos where id = $1",
        [factura.id],
      )
    ).rows[0];
    // La firma del DTE original sigue siendo válida y corresponde a su documento
    expect(verificarJws(guardado.firma, certificadoPem)).toMatchObject({
      identificacion: { codigoGeneracion: factura.codigoGeneracion },
    });
    // El evento se firmó con el mismo certificado y contiene lo que se guardó
    const firmado = verificarJws(guardado.firma_invalidacion, certificadoPem) as Json;
    expect(firmado).toEqual(guardado.evento_invalidacion);
    expect(firmado["documento"]).toMatchObject({ codigoGeneracion: factura.codigoGeneracion });
    // Alterar el evento invalida su firma
    const [encabezado, cuerpo, firma] = String(guardado.firma_invalidacion).split(".") as [
      string,
      string,
      string,
    ];
    const evento = JSON.parse(deBase64url(cuerpo)) as Json;
    evento["documento"].codigoGeneracion = ccf.codigoGeneracion;
    expect(
      verificarJws(`${encabezado}.${base64url(JSON.stringify(evento))}.${firma}`, certificadoPem),
    ).toBeNull();
    // Un evento ya firmado no se puede cambiar en la base
    await expect(
      s.c.query("update documentos_electronicos set firma_invalidacion = 'x' where id = $1", [factura.id]),
    ).rejects.toThrow(/ya está invalidado/);
  });
});
