import { afterEach, describe, expect, it, vi } from "vitest";
import { simularApi } from "@/test/api-simulada";
import {
  api,
  apiArchivo,
  configurarToken,
  ErrorApi,
  MENSAJE_SIN_CONEXION,
  mensajeDeError,
  nombreDeDisposicion,
} from "./api";

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
    const error = await api("/empresas/e1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).message).toBe("Ya existe una empresa con ese NIT");
  });

  it("usa un mensaje según el estado cuando la API no envía ninguno", async () => {
    simularApi({ "GET /empresas/e1": { estado: 403 } });
    const error = await api("/empresas/e1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).message).toBe("No tienes permiso para realizar esta acción.");
  });

  it("informa la falta de conexión con estado 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await api("/empresas").catch((e: unknown) => e);
    expect((error as ErrorApi).estado).toBe(0);
    expect(mensajeDeError(error)).toBe(MENSAJE_SIN_CONEXION);
  });
});

describe("archivos en el cliente de la API", () => {
  afterEach(() => configurarToken(() => null));

  it("envía un FormData tal cual, sin Content-Type JSON", async () => {
    configurarToken(async () => "jwt-de-prueba");
    const peticiones = simularApi({ "POST /archivos": { cuerpo: { valido: true } } });
    const formulario = new FormData();
    formulario.append("archivo", new File(["x"], "catalogo.xlsx"));

    await api("/archivos", { metodo: "POST", cuerpo: formulario });

    expect(peticiones[0]?.cuerpo).toBe(formulario);
    expect(peticiones[0]?.cabeceras["Content-Type"]).toBeUndefined();
    expect(peticiones[0]?.cabeceras.Authorization).toBe("Bearer jwt-de-prueba");
  });

  it("descarga el archivo con el nombre de filename*, con tildes", async () => {
    simularApi({
      "GET /plantilla": {
        archivo: new Blob(["xlsx"]),
        cabeceras: {
          "Content-Disposition": `attachment; filename="plantilla_catalogo.xlsx"; filename*=UTF-8''plantilla_cat%C3%A1logo.xlsx`,
        },
      },
    });

    const { contenido, nombre } = await apiArchivo("/plantilla");

    expect(nombre).toBe("plantilla_catálogo.xlsx");
    expect(await contenido.text()).toBe("xlsx");
  });

  it("si no viene el archivo, lanza ErrorApi con el mensaje de la API", async () => {
    simularApi({ "GET /plantilla": { estado: 403, cuerpo: { message: "Su rol no permite importar." } } });
    const error = await apiArchivo("/plantilla").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).message).toBe("Su rol no permite importar.");
  });
});

describe("nombreDeDisposicion", () => {
  it.each([
    [
      "filename*=UTF-8 con tilde",
      `attachment; filename*=UTF-8''saldos_a%C3%B1o_2026.xlsx`,
      "saldos_año_2026.xlsx",
    ],
    ["filename* con idioma", `attachment; filename*=UTF-8'es'cat%C3%A1logo.xlsx`, "catálogo.xlsx"],
    ["filename entre comillas", `attachment; filename="plantilla_catalogo.xlsx"`, "plantilla_catalogo.xlsx"],
    ["filename sin comillas", "attachment; filename=plantilla.xlsx", "plantilla.xlsx"],
    [
      "filename* mal codificado, con filename de respaldo",
      `attachment; filename="respaldo.xlsx"; filename*=UTF-8''mal%E0.xlsx`,
      "respaldo.xlsx",
    ],
    ["sin nombre", "attachment", null],
  ])("%s", (_, cabecera, esperado) => {
    expect(nombreDeDisposicion(cabecera)).toBe(esperado);
  });

  it("sin cabecera devuelve null", () => {
    expect(nombreDeDisposicion(null)).toBeNull();
  });
});
