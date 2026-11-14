import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers.js";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const EMPRESA = "a1111111-1111-4111-8111-111111111111";
const ADMIN = "b1111111-1111-4111-8111-111111111111";
const CONSULTA = "b2222222-2222-4222-8222-222222222222";

const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let app: INestApplication;
let url: string;
let c: Awaited<ReturnType<typeof reiniciarBase>>;
const databaseUrlAnterior = process.env["DATABASE_URL"];

async function pedir(metodo: string, ruta: string, cuerpo?: unknown, usuarioId = ADMIN) {
  const response = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${usuarioId}`,
      ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const databaseUrl = await basePropia("contable_api_ejercicios");
  c = await reiniciarBase(databaseUrl);
  await c.query(`
    INSERT INTO empresas (id, nombre, nit, tipo_contribuyente)
    VALUES ('${EMPRESA}', 'Empresa de prueba', '0101-010101-101-1', 'persona_natural');
    INSERT INTO usuarios (id, nombre, correo)
    VALUES
      ('${ADMIN}', 'Administrador', 'admin@ejercicios.test'),
      ('${CONSULTA}', 'Consulta', 'consulta@ejercicios.test');
    INSERT INTO membresias (usuario_id, empresa_id, rol_id, todas_sucursales)
    VALUES ('${ADMIN}', '${EMPRESA}', 1, true), ('${CONSULTA}', '${EMPRESA}', 4, false);
  `);

  process.env["DATABASE_URL"] = databaseUrl;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue(authPrueba)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
}, 60000);

afterAll(async () => {
  await app?.close();
  await c?.end();
  if (databaseUrlAnterior === undefined) delete process.env["DATABASE_URL"];
  else process.env["DATABASE_URL"] = databaseUrlAnterior;
});

describe("API de ejercicios (S1-T74)", () => {
  it("crea un ejercicio con doce períodos mensuales", async () => {
    const response = await pedir("POST", `/empresas/${EMPRESA}/ejercicios`, {
      anio: 2027,
      fechaInicio: "2027-01-01",
      fechaFin: "2027-12-31",
    });
    const periodos = response.body["periodos"] as Record<string, unknown>[];

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ fechaInicio: "2027-01-01", fechaFin: "2027-12-31" });
    expect(periodos).toHaveLength(12);
    expect(periodos.map((periodo) => periodo["mes"])).toEqual(
      Array.from({ length: 12 }, (_, indice) => indice + 1),
    );
    expect(periodos[0]).toMatchObject({ fechaInicio: "2027-01-01", fechaFin: "2027-01-31", cerradoEn: null });
    expect(periodos[11]).toMatchObject({
      fechaInicio: "2027-12-01",
      fechaFin: "2027-12-31",
      cerradoEn: null,
    });
  });

  it("lista los ejercicios e incluye sus períodos", async () => {
    const response = await pedir("GET", `/empresas/${EMPRESA}/ejercicios`);
    const ejercicios = response.body as unknown as Record<string, unknown>[];

    expect(response.status).toBe(200);
    expect(ejercicios).toHaveLength(1);
    expect(ejercicios[0]).toMatchObject({ anio: 2027 });
    expect(ejercicios[0]?.["periodos"]).toHaveLength(12);
  });

  it("rechaza fechas que no cubren el año indicado", async () => {
    const response = await pedir("POST", `/empresas/${EMPRESA}/ejercicios`, {
      anio: 2028,
      fechaInicio: "2028-02-01",
      fechaFin: "2029-01-31",
    });

    expect(response.status).toBe(400);
  });

  it("rechaza crear dos ejercicios para el mismo año", async () => {
    const response = await pedir("POST", `/empresas/${EMPRESA}/ejercicios`, {
      anio: 2027,
      fechaInicio: "2027-01-01",
      fechaFin: "2027-12-31",
    });

    expect(response.status, JSON.stringify(response.body)).toBe(409);
  });

  it("no permite que un usuario de consulta cree ejercicios", async () => {
    const response = await pedir(
      "POST",
      `/empresas/${EMPRESA}/ejercicios`,
      { anio: 2028, fechaInicio: "2028-01-01", fechaFin: "2028-12-31" },
      CONSULTA,
    );

    expect(response.status).toBe(403);
  });
});
