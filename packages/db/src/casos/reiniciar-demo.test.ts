import { describe, expect, it } from "vitest";
import { validarReinicioDemo, validarUrlCargaDemo } from "./reiniciar-demo.ts";

const URL_DEMO = "postgresql://postgres:postgres@localhost:54329/contable_demo";

describe("validarReinicioDemo", () => {
  it("permite únicamente la base dedicada local con confirmación explícita", () => {
    expect(() => validarReinicioDemo(URL_DEMO, "1")).not.toThrow();
  });

  it.each([
    ["base principal", "postgresql://postgres:postgres@localhost:54329/contable", "1"],
    ["servidor remoto", "postgresql://postgres:postgres@db.example.com/contable_demo", "1"],
    ["parámetro host que redirige la conexión", `${URL_DEMO}?host=db.example.com`, "1"],
    ["parámetro port de conexión", `${URL_DEMO}?port=5432`, "1"],
    ["sin confirmación", URL_DEMO, undefined],
  ])("rechaza el reinicio si %s", (_caso, url, confirmar) => {
    expect(() => validarReinicioDemo(url, confirmar)).toThrow();
  });
});

describe("validarUrlCargaDemo", () => {
  it("detecta el host de la autoridad y permite cargar una URL PostgreSQL local", () => {
    expect(validarUrlCargaDemo(URL_DEMO)).toBe(true);
    expect(validarUrlCargaDemo("postgresql://postgres:postgres@db.example.com/contable_demo")).toBe(false);
  });

  it.each([`${URL_DEMO}?host=db.example.com`, `${URL_DEMO}?hostaddr=203.0.113.10`, `${URL_DEMO}?port=5432`])(
    "rechaza parámetros que podrían cambiar el destino: %s",
    (url) => {
      expect(() => validarUrlCargaDemo(url)).toThrow(/parámetros de conexión/);
    },
  );
});
