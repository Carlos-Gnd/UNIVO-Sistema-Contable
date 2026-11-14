import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers.js";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const EMPRESA = "a1111111-1111-4111-8111-111111111111";
const ADMIN = "b1111111-1111-4111-8111-111111111111";
const CUENTA_PADRE = "c1111111-1111-4111-8111-111111111111";

const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let app: INestApplication;
let url: string;
let c: Awaited<ReturnType<typeof reiniciarBase>>;
const databaseUrlAnterior = process.env["DATABASE_URL"];

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const response = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${ADMIN}`,
      ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const databaseUrl = await basePropia("contable_api_cuentas");
  c = await reiniciarBase(databaseUrl);
  await c.query(`
    INSERT INTO empresas (id, nombre, nit, tipo_contribuyente)
    VALUES ('${EMPRESA}', 'Empresa de prueba', '0101-010101-101-1', 'persona_natural');
    INSERT INTO usuarios (id, nombre, correo)
    VALUES ('${ADMIN}', 'Administrador', 'admin@cuentas.test');
    INSERT INTO membresias (usuario_id, empresa_id, rol_id, todas_sucursales)
    VALUES ('${ADMIN}', '${EMPRESA}', 1, true);
    INSERT INTO cuentas (id, empresa_id, codigo, nombre, naturaleza, tipo)
    VALUES ('${CUENTA_PADRE}', '${EMPRESA}', '9', 'Otros activos', 'deudora', 'activo');
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

describe("API de cuentas (S1-T62)", () => {
  it("lista las cuentas de la empresa", async () => {
    const response = await pedir("GET", `/empresas/${EMPRESA}/cuentas`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: CUENTA_PADRE, codigo: "9", nivel: 1 });
  });

  it("crea una cuenta y la base asigna nivel y padre", async () => {
    const response = await pedir("POST", `/empresas/${EMPRESA}/cuentas`, {
      codigo: "91",
      nombre: "Bancos",
      naturaleza: "deudora",
      tipo: "activo",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      codigo: "91",
      nombre: "Bancos",
      nivel: 2,
      cuentaPadreId: CUENTA_PADRE,
      activa: true,
    });
  });

  it("responde 409 si el código ya existe en la empresa", async () => {
    const datos = {
      codigo: "94",
      nombre: "Cuenta duplicada",
      naturaleza: "deudora",
      tipo: "activo",
    };
    const primera = await pedir("POST", `/empresas/${EMPRESA}/cuentas`, datos);
    const segunda = await pedir("POST", `/empresas/${EMPRESA}/cuentas`, datos);

    expect(primera.status).toBe(201);
    expect(segunda.status, JSON.stringify(segunda.body)).toBe(409);
  });

  it("responde 422 con el mensaje de la base si falta la cuenta padre", async () => {
    const response = await pedir("POST", `/empresas/${EMPRESA}/cuentas`, {
      codigo: "910101",
      nombre: "Cuenta sin padre",
      naturaleza: "deudora",
      tipo: "activo",
    });

    expect(response.status).toBe(422);
    expect(response.body["message"]).toContain("No existe la cuenta padre");
  });

  it("edita la cuenta sin cambiar la relación jerárquica", async () => {
    const creada = await pedir("POST", `/empresas/${EMPRESA}/cuentas`, {
      codigo: "92",
      nombre: "Cuenta por editar",
      naturaleza: "deudora",
      tipo: "activo",
    });
    const cuentaId = String(creada.body["id"]);
    const response = await pedir("PATCH", `/empresas/${EMPRESA}/cuentas/${cuentaId}`, {
      nombre: "Bancos actualizados",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ nombre: "Bancos actualizados", cuentaPadreId: CUENTA_PADRE });
  });

  it("permite inactivar y reactivar sin borrar físicamente la cuenta", async () => {
    const creada = await pedir("POST", `/empresas/${EMPRESA}/cuentas`, {
      codigo: "93",
      nombre: "Cuenta por inactivar",
      naturaleza: "deudora",
      tipo: "activo",
    });
    const cuentaId = String(creada.body["id"]);
    const ruta = `/empresas/${EMPRESA}/cuentas/${cuentaId}`;
    const respuestaInactivar = await pedir("PATCH", ruta, { activa: false });

    expect(respuestaInactivar.status).toBe(200);
    expect(respuestaInactivar.body).toMatchObject({ id: cuentaId, activa: false });
    expect(await c.query("SELECT id FROM cuentas WHERE id = $1", [cuentaId])).toHaveProperty("rowCount", 1);

    const respuestaReactivar = await pedir("PATCH", ruta, { activa: true });
    expect(respuestaReactivar.status).toBe(200);
    expect(respuestaReactivar.body).toMatchObject({ id: cuentaId, activa: true });
  });

  it("responde 422 al cambiar el código de una cuenta con movimientos", async () => {
    await c.query(
      `INSERT INTO sucursales (empresa_id, nombre, codigo_establecimiento, es_matriz)
       VALUES ($1, 'Casa matriz', 'M001', true)`,
      [EMPRESA],
    );
    await c.query(
      `INSERT INTO ejercicios (empresa_id, anio, fecha_inicio, fecha_fin)
       VALUES ($1, 2026, '2026-01-01', '2026-12-31')`,
      [EMPRESA],
    );
    const cuenta = await pedir("POST", `/empresas/${EMPRESA}/cuentas`, {
      codigo: "95",
      nombre: "Cuenta con movimiento",
      naturaleza: "deudora",
      tipo: "activo",
    });
    const contrapartida = await pedir("POST", `/empresas/${EMPRESA}/cuentas`, {
      codigo: "96",
      nombre: "Contrapartida",
      naturaleza: "acreedora",
      tipo: "pasivo",
    });
    expect(cuenta.status).toBe(201);
    expect(contrapartida.status).toBe(201);
    const sucursal = await c.query("SELECT id FROM sucursales WHERE empresa_id = $1", [EMPRESA]);
    const partida = await c.query(
      "INSERT INTO partidas (empresa_id, sucursal_id, fecha, concepto) VALUES ($1, $2, '2026-01-15', 'Prueba') RETURNING id",
      [EMPRESA, sucursal.rows[0].id],
    );
    await c.query(
      `INSERT INTO partida_detalles (partida_id, cuenta_id, debe, haber, orden)
       VALUES ($1, $2, 10, 0, 0), ($1, $3, 0, 10, 1)`,
      [partida.rows[0].id, cuenta.body["id"], contrapartida.body["id"]],
    );

    const response = await pedir("PATCH", `/empresas/${EMPRESA}/cuentas/${String(cuenta.body["id"])}`, {
      codigo: "97",
    });

    expect(response.status).toBe(422);
    expect(response.body["message"]).toContain("porque tiene movimientos");
  });
});
