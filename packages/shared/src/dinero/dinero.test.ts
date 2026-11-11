import { describe, expect, it } from "vitest";
import { Dinero } from "./dinero";

describe("Dinero", () => {
  it("suma sin errores de punto flotante", () => {
    // 0.1 + 0.2 = 0.30000000000000004 en JavaScript
    expect(Dinero.de("0.1").mas("0.2").aTexto()).toBe("0.30");
  });

  it("redondea a dos decimales con medio hacia arriba", () => {
    expect(Dinero.de("10.005").aTexto()).toBe("10.01");
    expect(Dinero.de("10.004").aTexto()).toBe("10.00");
  });

  it("suma una lista de montos", () => {
    expect(Dinero.sumar(["1250.10", "349.90", 400]).aTexto()).toBe("2000.00");
    expect(Dinero.sumar([]).aTexto()).toBe("0.00");
  });

  it("calcula el IVA del 13 % redondeado al centavo", () => {
    expect(Dinero.de("40000").porcentaje(13).aTexto()).toBe("5200.00");
    expect(Dinero.de("99.99").porcentaje(13).aTexto()).toBe("13.00");
  });

  it("compara montos", () => {
    expect(Dinero.de("100.00").igualA("100")).toBe(true);
    expect(Dinero.de("100.01").igualA("100")).toBe(false);
    expect(Dinero.de("0").esCero()).toBe(true);
    expect(Dinero.de("-5").esNegativo()).toBe(true);
  });

  it("formatea en dólares con separador de miles", () => {
    expect(Dinero.de("1234567.5").formatear()).toBe("$1,234,567.50");
    expect(Dinero.de("-80").formatear()).toBe("-$80.00");
  });

  it("rechaza valores que no son números", () => {
    expect(() => Dinero.de("abc")).toThrow();
    expect(() => Dinero.de(Number.NaN)).toThrow();
  });
});
