import { afterEach, describe, expect, it, vi } from "vitest";
import { simularApi } from "@/test/api-simulada";
import { api, configurarToken, ErrorApi, MENSAJE_SIN_CONEXION, mensajeDeError } from "./api";

describe("cliente de la API", () => {
  afterEach(() => configurarToken(() => null));

  it("envía el token como Bearer y el cuerpo como JSON", async () => {
    configurarToken(async () => "jwt-de-prueba");
    const peticiones = simularApi({ "POST /empresas": { estado: 201, cuerpo: { id: "e1" } } });

    const r = await api<{ id: string }>("/empresas", { metodo: "POST", cuerpo: { nombre: "Chero" } });

    expect(r).toEqual({ id: "e1" });
    expect(peticiones[0]?.cabeceras.Authorization).toBe("Bearer jwt-de-prueba");
    expect(peticiones[0]?.cabeceras["Content-Type"]).toBe("application/json");
    expect(peticiones[0]?.cuerpo).toEqual({ nombre: "Chero" });
  });

  it("no envía Authorization sin sesión", async () => {
    const peticiones = simularApi({ "GET /health": { cuerpo: { ok: true } } });
    await api("/health");
    expect(peticiones[0]?.cabeceras.Authorization).toBeUndefined();
  });

  it("convierte la respuesta 400 de validar() en errores por campo", async () => {
    simularApi({
      "POST /empresas": {
        estado: 400,
        cuerpo: { mensaje: "Los datos enviados no son válidos.", errores: { nit: ["NIT inválido."] } },
      },
    });

    const error = await api("/empresas", { metodo: "POST", cuerpo: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).estado).toBe(400);
    expect((error as ErrorApi).errorDe("nit")).toBe("NIT inválido.");
  });

  it("usa el message de las excepciones de NestJS", async () => {
    simularApi({
      "GET /empresas/e1": { estado: 409, cuerpo: { message: "Ya existe una empresa con ese NIT" } },
    });
    await expect(api("/empresas/e1")).rejects.toThrow("Ya existe una empresa con ese NIT");
  });

  it("usa un mensaje según el estado cuando la API no envía ninguno", async () => {
    simularApi({ "GET /empresas/e1": { estado: 403 } });
    await expect(api("/empresas/e1")).rejects.toThrow("No tienes permiso para realizar esta acción.");
  });

  it("informa la falta de conexión con estado 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await api("/empresas").catch((e: unknown) => e);
    expect((error as ErrorApi).estado).toBe(0);
    expect(mensajeDeError(error)).toBe(MENSAJE_SIN_CONEXION);
  });
});
