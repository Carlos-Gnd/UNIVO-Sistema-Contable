// Firma digital de estados financieros (HU-87, S4-T31) y portal público de verificación (HU-88, S4-T34).
// Usa una base propia (contable_api_firmas) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { EstadoFirmadoVista, VerificacionEstado } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, errorDe, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { verificarPdf } from "../src/modules/firma/domain/pdf-firmado.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;

const BALANCE = {
  titulo: "Balance general",
  periodo: "Al 31 de octubre de 2026",
  alcance: "Empresa (todas las sucursales)",
  columnas: [{ titulo: "Saldo", tipo: "dinero" }],
  filas: [
    { tipo: "seccion", texto: "Activo" },
    { tipo: "renglon", texto: "Efectivo y equivalentes", valores: ["12500.00"] },
    { tipo: "renglon", texto: "Inventarios", valores: ["8300.50"] },
    { tipo: "total", texto: "Total activo", valores: ["20800.50"] },
    { tipo: "parrafo", texto: "Las cifras están expresadas en dólares." },
  ],
};

async function pedir(metodo: string, ruta: string, usuario: string | null, cuerpo?: unknown) {
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

async function descargar(id: string): Promise<Buffer> {
  const r = await fetch(`${url}/empresas/${emp.empresaId}/estados-firmados/${id}/pdf`, {
    headers: { authorization: `Bearer ${CONTADOR}` },
  });
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("application/pdf");
  return Buffer.from(await r.arrayBuffer());
}

async function verificarArchivo(codigo: string, pdf: Buffer) {
  const datos = new FormData();
  datos.append("archivo", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "estado.pdf");
  const r = await fetch(`${url}/verificacion/${codigo}`, { method: "POST", body: datos });
  return { status: r.status, cuerpo: (await r.json()) as VerificacionEstado };
}

beforeAll(async () => {
  process.env["FIRMA_SECRETO"] = "secreto-de-pruebas-de-firma-con-mas-de-32-caracteres";
  process.env["WEB_URL"] = "https://contable.test";
  const urlBase = await basePropia("contable_api_firmas");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-7");
  await crearUsuario(c, CONTADOR, 2, emp);
  await crearUsuario(c, AUXILIAR, 3, emp, [emp.sucursalId]);
  await c.query("update usuarios set nombre = 'María José Núñez' where id = $1", [CONTADOR]);

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("firma de estados financieros (HU-87)", () => {
  let firma: EstadoFirmadoVista;
  let pdf: Buffer;

  it("solo firma quien tiene estados.firmar", async () => {
    const r = await pedir("POST", `/empresas/${emp.empresaId}/estados-firmados`, AUXILIAR, BALANCE);
    expect(r.status).toBe(403);
  });

  it("valida el documento que se firma", async () => {
    const r = await pedir("POST", `/empresas/${emp.empresaId}/estados-firmados`, CONTADOR, {
      ...BALANCE,
      filas: [],
    });
    expect(r.status).toBe(400);
  });

  it("firma el estado con el certificado del usuario y un código de verificación", async () => {
    const r = await pedir("POST", `/empresas/${emp.empresaId}/estados-firmados`, CONTADOR, BALANCE);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    firma = r.cuerpo as unknown as EstadoFirmadoVista;
    expect(firma).toMatchObject({
      titulo: "Balance general",
      firmante: "María José Núñez",
      cargo: "Contador",
    });
    expect(firma.codigoVerificacion).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(firma.urlVerificacion).toBe(`https://contable.test/verificar/${firma.codigoVerificacion}`);

    // La autoridad emitió un certificado para el usuario en la empresa
    const certs = await c.query(
      "select titular from certificados_firma where empresa_id = $1 and usuario_id = $2 and vigente",
      [emp.empresaId, CONTADOR],
    );
    expect(certs.rows).toEqual([{ titular: "María José Núñez" }]);
  });

  it("el PDF firmado lleva una firma PAdES válida del firmante que cubre todo el archivo", async () => {
    pdf = await descargar(firma.id);
    expect(pdf.toString("latin1")).toContain("/ETSI.CAdES.detached");
    const autoridad = (await c.query("select certificado_pem from autoridad_certificadora")).rows[0]
      .certificado_pem;
    expect(verificarPdf(pdf, autoridad)).toMatchObject({
      firmado: true,
      integro: true,
      firmaValida: true,
      cubreTodo: true,
      certificado: { titular: "María José Núñez" },
    });
  });

  it("reutiliza el certificado del usuario en la siguiente firma", async () => {
    const r = await pedir("POST", `/empresas/${emp.empresaId}/estados-firmados`, CONTADOR, {
      ...BALANCE,
      titulo: "Estado de resultados",
    });
    expect(r.status).toBe(201);
    const n = await c.query("select count(*)::int n from certificados_firma where usuario_id = $1", [
      CONTADOR,
    ]);
    expect(n.rows[0].n).toBe(1);
    const lista = (await pedir("GET", `/empresas/${emp.empresaId}/estados-firmados`, AUXILIAR))
      .cuerpo as unknown as EstadoFirmadoVista[];
    expect(lista.map((f) => f.titulo)).toEqual(["Estado de resultados", "Balance general"]);
  });

  it("una firma no se modifica ni se borra", async () => {
    expect(await errorDe(c, "update estados_firmados set titulo = 'Otro' where id = $1", [firma.id])).toMatch(
      /no se modifica/,
    );
    expect(
      await errorDe(c, "delete from estados_firmados_archivos where estado_firmado_id = $1", [firma.id]),
    ).toMatch(/no se modifica/);
  });

  describe("portal de verificación (HU-88)", () => {
    it("muestra firmante, fecha y certificado sin iniciar sesión", async () => {
      const r = await pedir("GET", `/verificacion/${firma.codigoVerificacion.toLowerCase()}`, null);
      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({
        codigoVerificacion: firma.codigoVerificacion,
        titulo: "Balance general",
        firmante: "María José Núñez",
        firmadoEn: firma.firmadoEn,
        integro: null,
        certificado: {
          titular: "María José Núñez",
          emisor: expect.stringContaining("Autoridad Certificadora Simulada"),
        },
      });
    });

    it("confirma el PDF firmado como íntegro", async () => {
      const r = await verificarArchivo(firma.codigoVerificacion, pdf);
      expect(r.status).toBe(201);
      expect(r.cuerpo).toMatchObject({ integro: true, archivo: { firmaValida: true, coincideHuella: true } });
    });

    it("rechaza un PDF alterado", async () => {
      const alterado = Buffer.from(pdf);
      const i = alterado.indexOf("stream") + 20;
      alterado[i] = alterado[i]! ^ 0xff;
      const r = await verificarArchivo(firma.codigoVerificacion, alterado);
      expect(r.cuerpo).toMatchObject({
        integro: false,
        archivo: { firmaValida: false, coincideHuella: false },
      });
    });

    it("el PDF de otro estado firmado no pasa por este", async () => {
      const [otro] = (await pedir("GET", `/empresas/${emp.empresaId}/estados-firmados`, CONTADOR))
        .cuerpo as unknown as EstadoFirmadoVista[];
      const r = await verificarArchivo(firma.codigoVerificacion, await descargar(otro!.id));
      expect(r.cuerpo).toMatchObject({
        integro: false,
        archivo: { firmaValida: true, coincideHuella: false },
      });
    });

    it("responde 404 a un código inexistente y 400 a uno mal formado", async () => {
      expect((await pedir("GET", "/verificacion/AAAA-BBBB-CCCC", null)).status).toBe(404);
      expect((await pedir("GET", "/verificacion/no-es-un-codigo", null)).status).toBe(400);
    });
  });
});
