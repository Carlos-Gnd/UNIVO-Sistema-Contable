import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const USUARIO_UNO = "11111111-1111-4111-8111-111111111111";
const USUARIO_DOS = "22222222-2222-4222-8222-222222222222";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;

async function pedir(metodo: string, usuarioId?: string, cuerpo?: unknown) {
  const respuesta = await fetch(`${url}/usuarios/me/modo-didactico`, {
    method: metodo,
    headers: {
      ...(usuarioId ? { authorization: `Bearer ${usuarioId}` } : {}),
      ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, contenido: (await respuesta.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_modo_didactico");
  c = await reiniciarBase(urlBase);
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Usuario uno', 'uno@didactico.test'), ($2, 'Usuario dos', 'dos@didactico.test')",
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

describe("preferencia de modo didáctico por usuario", () => {
  it("exige sesión y rechaza valores distintos de booleanos", async () => {
    expect((await pedir("GET")).status).toBe(401);
    expect((await pedir("PATCH", undefined, { activo: true })).status).toBe(401);
    expect((await pedir("PATCH", USUARIO_UNO, { activo: "true" })).status).toBe(400);
  });

  it("persiste la preferencia del usuario autenticado sin alterar la de otros usuarios", async () => {
    expect(await pedir("GET", USUARIO_UNO)).toMatchObject({ status: 200, contenido: { activo: false } });
    expect(await pedir("PATCH", USUARIO_UNO, { activo: true })).toMatchObject({
      status: 200,
      contenido: { activo: true },
    });
    expect(await pedir("GET", USUARIO_UNO)).toMatchObject({ status: 200, contenido: { activo: true } });
    expect(await pedir("GET", USUARIO_DOS)).toMatchObject({ status: 200, contenido: { activo: false } });
  });
});
