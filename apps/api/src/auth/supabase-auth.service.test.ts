import { ServiceUnavailableException } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseAuthService } from "./supabase-auth.service.js";

// Supabase se simula: las pruebas no salen a la red ni necesitan credenciales.
const getClaims = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ auth: { getClaims } })) }));

const configurar = () => {
  vi.stubEnv("SUPABASE_URL", "https://proyecto.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_prueba");
};

const claims = (datos: Record<string, unknown>) => ({ data: { claims: datos }, error: null });

describe("SupabaseAuthService", () => {
  beforeEach(() => {
    getClaims.mockReset();
    vi.mocked(createClient).mockClear();
  });

  it("responde 503 cuando falta la configuración de Supabase", async () => {
    vi.stubEnv("SUPABASE_URL", undefined);
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", undefined);

    await expect(new SupabaseAuthService().verificarToken("token")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("devuelve el usuario con su id y correo cuando el token es válido", async () => {
    configurar();
    getClaims.mockResolvedValue(claims({ sub: "usuario-1", email: "contador@ejemplo.com" }));

    await expect(new SupabaseAuthService().verificarToken("token-valido")).resolves.toEqual({
      id: "usuario-1",
      email: "contador@ejemplo.com",
    });
    expect(getClaims).toHaveBeenCalledWith("token-valido");
  });

  it("crea el cliente una sola vez y sin guardar sesión en el servidor", async () => {
    configurar();
    getClaims.mockResolvedValue(claims({ sub: "usuario-1" }));
    const servicio = new SupabaseAuthService();

    await servicio.verificarToken("a");
    await servicio.verificarToken("b");

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("https://proyecto.supabase.co", "sb_publishable_prueba", {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  });

  it("omite el correo si el token no trae uno de tipo texto", async () => {
    configurar();
    getClaims.mockResolvedValue(claims({ sub: "usuario-1", email: 42 }));

    await expect(new SupabaseAuthService().verificarToken("t")).resolves.toEqual({ id: "usuario-1" });
  });

  it.each([
    ["Supabase rechaza el token (401)", { data: null, error: { status: 401, message: "invalid JWT" } }],
    ["el token expiró (403)", { data: null, error: { status: 403, message: "expired" } }],
    ["no hay datos ni error", { data: null, error: null }],
    ["los claims no traen sub", claims({ email: "x@ejemplo.com" })],
    ["sub viene vacío", claims({ sub: "" })],
    ["sub no es texto", claims({ sub: 123 })],
  ])("devuelve null cuando %s", async (_caso, respuesta) => {
    configurar();
    getClaims.mockResolvedValue(respuesta);

    await expect(new SupabaseAuthService().verificarToken("t")).resolves.toBeNull();
  });

  it.each([
    ["Supabase responde con error 500", { data: null, error: { status: 500, message: "down" } }],
    ["el error no trae código de estado", { data: null, error: { message: "fetch failed" } }],
  ])("responde 503 cuando %s", async (_caso, respuesta) => {
    configurar();
    getClaims.mockResolvedValue(respuesta);

    await expect(new SupabaseAuthService().verificarToken("t")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("responde 503 cuando falla la conexión con Supabase", async () => {
    configurar();
    getClaims.mockRejectedValue(new TypeError("fetch failed"));

    await expect(new SupabaseAuthService().verificarToken("t")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
