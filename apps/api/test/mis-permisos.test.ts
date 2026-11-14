import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers.js";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const EMPRESA = "a1111111-1111-4111-8111-111111111111";
const ADMIN = "b1111111-1111-4111-8111-111111111111";
const AUXILIAR = "b2222222-2222-4222-8222-222222222222";
const SIN_MEMBRESIA = "b3333333-3333-4333-8333-333333333333";
const MATRIZ = "c1111111-1111-4111-8111-111111111111";
const SUCURSAL = "c2222222-2222-4222-8222-222222222222";
const SUCURSAL_INACTIVA = "c3333333-3333-4333-8333-333333333333";

const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let app: INestApplication;
let url: string;
let databaseUrl: string;
let c: Awaited<ReturnType<typeof reiniciarBase>>;
const databaseUrlAnterior = process.env["DATABASE_URL"];

async function pedir(usuarioId: string) {
  const response = await fetch(`${url}/empresas/${EMPRESA}/mis-permisos`, {
    headers: { authorization: `Bearer ${usuarioId}` },
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  databaseUrl = await basePropia("contable_api_mis_permisos");
  c = await reiniciarBase(databaseUrl);
  await c.query(`
    INSERT INTO empresas (id, nombre, nit, tipo_contribuyente)
    VALUES ('${EMPRESA}', 'Empresa de prueba', '0101-010101-101-1', 'persona_natural');
    INSERT INTO usuarios (id, nombre, correo)
    VALUES
      ('${ADMIN}', 'Administrador', 'admin@prueba.test'),
      ('${AUXILIAR}', 'Auxiliar', 'auxiliar@prueba.test'),
      ('${SIN_MEMBRESIA}', 'Sin membresía', 'sin-membresia@prueba.test');
    INSERT INTO sucursales (id, empresa_id, nombre, codigo_establecimiento, es_matriz, activa)
    VALUES
      ('${MATRIZ}', '${EMPRESA}', 'Casa matriz', 'M001', true, true),
      ('${SUCURSAL}', '${EMPRESA}', 'Sucursal activa', 'S001', false, true),
      ('${SUCURSAL_INACTIVA}', '${EMPRESA}', 'Sucursal inactiva', 'S002', false, false);
    INSERT INTO membresias (usuario_id, empresa_id, rol_id, todas_sucursales)
    VALUES ('${ADMIN}', '${EMPRESA}', 1, true), ('${AUXILIAR}', '${EMPRESA}', 3, false);
    INSERT INTO membresia_sucursales (membresia_id, sucursal_id)
    SELECT m.id, '${SUCURSAL}' FROM membresias m WHERE m.usuario_id = '${AUXILIAR}';
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

describe("GET /empresas/:empresaId/mis-permisos", () => {
  it("devuelve rol, permisos y solo las sucursales activas asignadas", async () => {
    const response = await pedir(AUXILIAR);
    const permisos = await c.query<{ permiso: string }>(
      "SELECT permiso FROM permisos_usuario WHERE usuario_id = $1 AND empresa_id = $2 ORDER BY permiso",
      [AUXILIAR, EMPRESA],
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      rol: "auxiliar",
      todasSucursales: false,
      sucursales: [SUCURSAL],
      permisos: permisos.rows.map((row) => row.permiso),
    });
  });

  it("devuelve todas las sucursales activas para el administrador", async () => {
    const response = await pedir(ADMIN);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      rol: "administrador",
      todasSucursales: true,
      sucursales: [MATRIZ, SUCURSAL],
    });
    expect(response.body["sucursales"]).not.toContain(SUCURSAL_INACTIVA);
  });

  it("responde 404 si el usuario no tiene membresía activa en la empresa", async () => {
    const response = await pedir(SIN_MEMBRESIA);

    expect(response.status).toBe(404);
  });
});
