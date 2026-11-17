// CORS de la API: la web de Vercel puede llamarla desde el navegador; otros orígenes no.
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";
import { configurarCors, origenesPermitidos } from "./cors.js";

const WEB = "https://univo-sistema-contable.vercel.app";

describe("orígenes permitidos", () => {
  it("toma WEB_URL y CORS_ORIGENES, sin barras finales ni repetidos", () => {
    expect(
      origenesPermitidos({
        NODE_ENV: "production",
        WEB_URL: `${WEB}/`,
        CORS_ORIGENES: ` https://vista-previa.vercel.app , ${WEB},`,
      }),
    ).toEqual([WEB, "https://vista-previa.vercel.app"]);
  });

  it("agrega la web local solo fuera de producción", () => {
    expect(origenesPermitidos({ NODE_ENV: "production" })).toEqual([]);
    expect(origenesPermitidos({ NODE_ENV: "development", WEB_URL: WEB })).toEqual([
      WEB,
      "http://localhost:5173",
    ]);
  });
});

describe("CORS por HTTP", () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configurarCors(app, { NODE_ENV: "production", WEB_URL: WEB });
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });

  const preflight = (origen: string) =>
    fetch(`${url}/empresas/3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f/partidas`, {
      method: "OPTIONS",
      headers: {
        Origin: origen,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

  it("responde el preflight de la web con su origen, métodos y cabeceras", async () => {
    const r = await preflight(WEB);
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe(WEB);
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
    expect(r.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("authorization");
  });

  it("no autoriza a otros orígenes", async () => {
    const r = await preflight("https://sitio-ajeno.com");
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("la respuesta normal también lleva el origen permitido, y la ruta sigue exigiendo token", async () => {
    const r = await fetch(`${url}/health`, { headers: { Origin: WEB } });
    expect(r.headers.get("access-control-allow-origin")).toBe(WEB);
    const protegida = await fetch(`${url}/empresas/3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f`, {
      headers: { Origin: WEB },
    });
    expect(protegida.status).toBe(401);
  });
});
