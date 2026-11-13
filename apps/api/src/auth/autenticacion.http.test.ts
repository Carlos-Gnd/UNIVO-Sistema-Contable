// Pruebas de punta a punta del guard global (S1-T36, HU-05): la API real responde por HTTP y
// rechaza con 401 las peticiones sin token válido. Solo se simula la verificación con Supabase.
import { Controller, Get, Module, Req, ServiceUnavailableException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module.js";
import { Public } from "./public.decorator.js";
import { SupabaseAuthService, type AuthenticatedUser } from "./supabase-auth.service.js";

const usuario: AuthenticatedUser = {
  id: "a0000000-0000-4000-8000-000000000002",
  email: "contador@ejemplo.com",
};

@Controller("prueba")
class ControladorDePrueba {
  @Get("privada")
  privada(@Req() req: { user?: AuthenticatedUser }): { usuario: AuthenticatedUser | undefined } {
    return { usuario: req.user };
  }

  @Public()
  @Get("publica")
  publica(): { ok: true } {
    return { ok: true };
  }
}

// Importa el AppModule real: el guard llega por APP_GUARD, igual que en producción.
@Module({ imports: [AppModule], controllers: [ControladorDePrueba] })
class ModuloDePrueba {}

describe("autenticación de la API por HTTP", () => {
  let app: INestApplication;
  let url: string;
  let verificarToken: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    app = await NestFactory.create(ModuloDePrueba, { logger: false });
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    verificarToken = vi
      .spyOn(SupabaseAuthService.prototype, "verificarToken")
      .mockImplementation(async (token) => (token === "token-valido" ? usuario : null));
  });

  const pedir = (ruta: string, authorization?: string) =>
    fetch(`${url}${ruta}`, { headers: authorization ? { authorization } : {} });

  it("las rutas públicas responden sin token", async () => {
    expect((await pedir("/health")).status).toBe(200);
    expect((await pedir("/prueba/publica")).status).toBe(200);
    expect(verificarToken).not.toHaveBeenCalled();
  });

  it("responde 401 a una ruta protegida sin token", async () => {
    const r = await pedir("/prueba/privada");

    expect(r.status).toBe(401);
    await expect(r.json()).resolves.toMatchObject({
      statusCode: 401,
      message: "Se requiere un token Bearer de Supabase",
    });
  });

  it("responde 401 con un token que Supabase no reconoce", async () => {
    const r = await pedir("/prueba/privada", "Bearer token-falso");

    expect(r.status).toBe(401);
    await expect(r.json()).resolves.toMatchObject({ message: "El token de Supabase no es válido" });
  });

  it("responde 401 con un esquema que no es Bearer", async () => {
    expect((await pedir("/prueba/privada", "Basic dXN1YXJpbzpjbGF2ZQ==")).status).toBe(401);
    expect(verificarToken).not.toHaveBeenCalled();
  });

  it("deja pasar un token válido y entrega el usuario al controlador", async () => {
    const r = await pedir("/prueba/privada", "Bearer token-valido");

    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toEqual({ usuario });
    expect(verificarToken).toHaveBeenCalledWith("token-valido");
  });

  it("responde 503, no 401, si Supabase no está disponible", async () => {
    verificarToken.mockRejectedValue(new ServiceUnavailableException("Supabase no disponible"));

    expect((await pedir("/prueba/privada", "Bearer token-valido")).status).toBe(503);
  });

  it("cada petición se verifica por separado: un token válido no deja abierta la sesión", async () => {
    expect((await pedir("/prueba/privada", "Bearer token-valido")).status).toBe(200);
    expect((await pedir("/prueba/privada")).status).toBe(401);
  });
});
