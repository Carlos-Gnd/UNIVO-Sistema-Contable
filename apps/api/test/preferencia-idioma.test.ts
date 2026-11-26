import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const USUARIO_UNO = "11111111-1111-4111-8111-111111111111";
const USUARIO_DOS = "22222222-2222-4222-8222-222222222222";
const SIN_PERFIL = "33333333-3333-4333-8333-333333333333";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;

async function pedir(metodo: string, usuarioId?: string, cuerpo?: unknown) {
  const respuesta = await fetch(`${url}/usuarios/me/idioma`, {
    method: metodo,
    headers: {
      ...(usuarioId ? { authorization: `Bearer ${usuarioId}` } : {}),
      ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return {
    status: respuesta.status,
    contenido: (await respuesta.json()) as Record<string, unknown>,
  };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_idioma");
  c = await reiniciarBase(urlBase);
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Usuario uno', 'uno@idioma.test'), ($2, 'Usuario dos', 'dos@idioma.test')",
    [USUARIO_UNO, USUARIO_DOS],
  );

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
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("preferencia de idioma del usuario (S4-T01)", () => {
  it("exige autenticación y valida el idioma recibido", async () => {
    expect((await pedir("GET")).status).toBe(401);
    expect((await pedir("PATCH", USUARIO_UNO, { idioma: "fr" })).status).toBe(400);
  });

  it("actualiza solo el perfil autenticado y deja el cambio en bitácora", async () => {
    const actualizacion = await pedir("PATCH", USUARIO_UNO, { idioma: "en" });
    expect(actualizacion.status).toBe(200);
    expect(actualizacion.contenido).toEqual({ idioma: "en" });
    expect(await pedir("GET", USUARIO_UNO)).toMatchObject({ status: 200, contenido: { idioma: "en" } });
    expect(await pedir("GET", USUARIO_DOS)).toMatchObject({ status: 200, contenido: { idioma: "es" } });

    const eventos = await c.query(
      "select usuario_id::text as usuario_id, accion, datos_nuevos ->> 'idioma' as idioma from bitacora where tabla = 'usuarios' and registro_id = $1 and accion = 'UPDATE'",
      [USUARIO_UNO],
    );
    expect(eventos.rows).toEqual([{ usuario_id: USUARIO_UNO, accion: "UPDATE", idioma: "en" }]);
  });

  it("devuelve español por omisión para un usuario autenticado sin fila de perfil", async () => {
    expect(await pedir("GET", SIN_PERFIL)).toMatchObject({ status: 200, contenido: { idioma: "es" } });
  });
});
