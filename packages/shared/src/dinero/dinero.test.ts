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

  // Formato de la propuesta de diseño (RNF-07): US$, separador de miles, dos decimales y negativos entre paréntesis
  it("formatea en dólares con separador de miles", () => {
    expect(Dinero.de("1234567.5").formatear()).toBe("US$ 1,234,567.50");
    expect(Dinero.de("12450").formatear()).toBe("US$ 12,450.00");
    expect(Dinero.de("0").formatear()).toBe("US$ 0.00");
    expect(Dinero.de("0.5").formatear()).toBe("US$ 0.50");
  });

  it("muestra los negativos entre paréntesis, como se usa en contabilidad", () => {
    expect(Dinero.de("-340").formatear()).toBe("(US$ 340.00)");
    expect(Dinero.de("-1234567.89").formatear()).toBe("(US$ 1,234,567.89)");
  });

  it("formatea sin símbolo para columnas de montos", () => {
    expect(Dinero.de("12450").formatear({ simbolo: false })).toBe("12,450.00");
    expect(Dinero.de("-340").formatear({ simbolo: false })).toBe("(340.00)");
  });

  it("rechaza notación exponencial y montos fuera del rango de NUMERIC(14,2)", () => {
    // "1e999999999" generaría un texto de mil millones de dígitos al formatearlo
    expect(() => Dinero.de("1e999999999")).toThrow(/inválido/);
    expect(() => Dinero.de(1e300)).toThrow(/rango/);
    expect(() => Dinero.de("1000000000000")).toThrow(/rango/);
    expect(Dinero.de("999999999999.99").aTexto()).toBe("999999999999.99");
    expect(() => Dinero.de("999999999999.99").mas("1")).toThrow(/rango/);
  });

  it("rechaza valores que no son números", () => {
    expect(() => Dinero.de("abc")).toThrow();
    expect(() => Dinero.de(Number.NaN)).toThrow();
  });
});
