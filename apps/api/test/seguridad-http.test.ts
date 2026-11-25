// Limitador de peticiones por usuario y cabeceras de seguridad (S2, revisión de seguridad).
import { Controller, Get, Module, type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Throttle, ThrottlerModule } from "@nestjs/throttler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LimiteUsuarioGuard } from "../src/compartido/limite-peticiones.js";
import { configurarSeguridad } from "../src/compartido/seguridad.js";

@Controller("prueba")
class PruebaController {
  @Get()
  general() {
    return { ok: true };
  }

  @Get("pesada")
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  pesada() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 3 }] })],
  controllers: [PruebaController],
  providers: [{ provide: APP_GUARD, useClass: LimiteUsuarioGuard }],
})
class ModuloPrueba {}

let app: INestApplication;
let url: string;

beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [ModuloPrueba] }).compile();
  app = modulo.createNestApplication({ logger: false });
  configurarSeguridad(app);
  // Simula SupabaseAuthGuard: el usuario llega en la cabecera de la prueba
  app.use(
    (
      solicitud: { headers: Record<string, string>; user?: { id: string } },
      _r: unknown,
      siguiente: () => void,
    ) => {
      const id = solicitud.headers["x-usuario"];
      if (id) solicitud.user = { id };
      siguiente();
    },
  );
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
});

const pedir = (ruta: string, usuario: string) =>
  fetch(`${url}/prueba${ruta}`, { headers: { "x-usuario": usuario } });

describe("limitador de peticiones", () => {
  it("responde 429 al pasar el tope de un usuario, sin afectar a otro", async () => {
    const estados = [];
    for (let i = 0; i < 4; i++) estados.push((await pedir("", "usuario-a")).status);
    expect(estados).toEqual([200, 200, 200, 429]);
    expect((await pedir("", "usuario-b")).status).toBe(200);
  });

  it("las rutas pesadas tienen un tope propio menor", async () => {
    expect((await pedir("/pesada", "usuario-c")).status).toBe(200);
    expect((await pedir("/pesada", "usuario-c")).status).toBe(429);
  });
});

describe("cabeceras de seguridad", () => {
  it("agrega helmet y no anuncia el framework", async () => {
    const r = await pedir("", "usuario-d");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("strict-transport-security")).toMatch(/max-age/);
    expect(r.headers.get("x-powered-by")).toBeNull();
  });
});
