import { describe, expect, it } from "vitest";
import { crearEmpresaSchema, nitSchema, nrcSchema } from "../esquemas";
import {
  esDuiValido,
  esNitODuiValido,
  esNitValido,
  esNrcValido,
  formatearNit,
  formatearNrc,
} from "./documentos";

// Casos de referencia del algoritmo de la DGII (los mismos que usa la librería idsv-js)
describe("DUI", () => {
  it.each(["12345678-4", "00000001-8", "01234567-8"])("acepta %s", (dui) => {
    expect(esDuiValido(dui)).toBe(true);
  });

  it.each([
    ["dígito verificador incorrecto", "12345678-9"],
    ["solo ceros", "00000000-0"],
    ["sin guion", "123456784"],
    ["dígitos de menos", "1234567-4"],
    ["letras", "1234567A-4"],
  ])("rechaza %s", (_caso, dui) => {
    expect(esDuiValido(dui)).toBe(false);
  });
});

describe("NIT de 14 dígitos", () => {
  it.each([
    ["rutina nueva (correlativo > 100)", "1234-567890-123-0"],
    ["rutina nueva con residuo mayor que 1", "0614-010190-101-5"],
    ["rutina nueva, correlativo 104", "0000-000000-104-0"],
    ["rutina antigua (correlativo ≤ 100)", "0000-000000-011-5"],
    ["rutina antigua, residuo 10 → 0", "1000-000000-009-0"],
  ])("acepta %s: %s", (_caso, nit) => {
    expect(esNitValido(nit)).toBe(true);
  });

  it.each([
    ["dígito verificador incorrecto", "1234-567890-123-1"],
    ["dígito verificador incorrecto en la rutina antigua", "0000-000000-011-4"],
    ["solo ceros", "0000-000000-000-0"],
    ["sin guiones", "12345678901230"],
    ["dígitos de más", "1234-567890-123-00"],
    ["un DUI", "12345678-4"],
  ])("rechaza %s", (_caso, nit) => {
    expect(esNitValido(nit)).toBe(false);
  });

  it("el correlativo 100 usa la rutina antigua y el 101 la nueva", () => {
    // El límite entre rutinas: con correlativo 100 pesa 14..2 y con 101 los pesos 2,7,6,5,4,3
    expect(esNitValido("0614-010190-100-0")).toBe(true);
    expect(esNitValido("0614-010190-101-5")).toBe(true);
  });

  it("acepta el DUI como NIT solo con esNitODuiValido", () => {
    expect(esNitODuiValido("12345678-4")).toBe(true);
    expect(esNitODuiValido("1234-567890-123-0")).toBe(true);
    expect(esNitODuiValido("12345678-5")).toBe(false);
  });
});

describe("NRC", () => {
  it.each(["1-0", "123456-7", "12345678-9"])("acepta %s", (nrc) => {
    expect(esNrcValido(nrc)).toBe(true);
  });

  it.each(["1234567", "123456789-0", "12A456-7", "0-0", "-7"])("rechaza %s", (nrc) => {
    expect(esNrcValido(nrc)).toBe(false);
  });
});

describe("formato", () => {
  it("agrega los guiones a un NIT o DUI escrito de corrido", () => {
    expect(formatearNit("12345678901230")).toBe("1234-567890-123-0");
    expect(formatearNit(" 123456784 ")).toBe("12345678-4");
    expect(formatearNit("1234 567890 123 0")).toBe("1234-567890-123-0");
    expect(formatearNit("12345")).toBe("12345");
    expect(formatearNrc("1234567")).toBe("123456-7");
  });
});

describe("esquemas de Zod", () => {
  it("nitSchema da formato y valida el dígito verificador", () => {
    expect(nitSchema.parse("12345678901230")).toBe("1234-567890-123-0");
    expect(nitSchema.parse("123456784")).toBe("12345678-4");
    const r = nitSchema.safeParse("1234-567890-123-1");
    expect(r.error?.issues[0]?.message).toMatch(/dígito verificador/);
    expect(nitSchema.safeParse("1234").error?.issues[0]?.message).toMatch(/formato/);
  });

  it("nrcSchema da formato al número sin guion", () => {
    expect(nrcSchema.parse("1234567")).toBe("123456-7");
    expect(nrcSchema.safeParse("abc").success).toBe(false);
  });

  it("una persona natural puede registrarse con su DUI, una sociedad no", () => {
    const base = { nombre: "Juan Pérez", nit: "12345678-4" };
    expect(crearEmpresaSchema.safeParse({ ...base, tipoContribuyente: "persona_natural" }).success).toBe(
      true,
    );
    const r = crearEmpresaSchema.safeParse({ ...base, tipoContribuyente: "sociedad" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["nit"]);
  });
});
