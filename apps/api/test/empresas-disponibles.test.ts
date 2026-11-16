import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const USUARIO = "a1111111-1111-4111-8111-111111111111";
const OTRO_USUARIO = "b2222222-2222-4222-8222-222222222222";
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esperada: { id: string; nombre: string };

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_empresas_disponibles");
  c = await reiniciarBase(urlBase);
  for (const [id, nombre] of [
    [USUARIO, "Ana"],
    [OTRO_USUARIO, "Beto"],
  ]) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${id}@prueba.sv`,
    ]);
  }

  const activa = await crearEscenario(c, "1234-560001-101-1");
  const inactiva = await crearEscenario(c, "1234-560002-101-2");
  const membresiaInactiva = await crearEscenario(c, "1234-560003-101-3");
  const deOtro = await crearEscenario(c, "1234-560004-101-4");
  const empresas = [activa, inactiva, membresiaInactiva, deOtro];
  const nombres = ["Empresa visible", "Empresa inactiva", "Membresía inactiva", "Empresa ajena"];
  const rol = (await c.query("select id from roles where codigo = 'administrador'")).rows[0].id as number;
  for (let i = 0; i < empresas.length; i++) {
    const usuarioId = i === 3 ? OTRO_USUARIO : USUARIO;
    await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, true)",
      [usuarioId, empresas[i]!.empresaId, rol],
    );
    await c.query("update empresas set nombre = $2 where id = $1", [empresas[i]!.empresaId, nombres[i]]);
  }
  await c.query("update empresas set activa = false where id = $1", [inactiva.empresaId]);
  await c.query("update membresias set activa = false where usuario_id = $1 and empresa_id = $2", [
    USUARIO,
    membresiaInactiva.empresaId,
  ]);
  esperada = { id: activa.empresaId, nombre: nombres[0]! };

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue(authPrueba)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("GET /empresas/disponibles", () => {
  it("solo devuelve empresas activas con membresía activa del usuario autenticado", async () => {
    const respuesta = await fetch(`${url}/empresas/disponibles`, {
      headers: { authorization: `Bearer ${USUARIO}` },
    });
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual([esperada]);
  });
});
