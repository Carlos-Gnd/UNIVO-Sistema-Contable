import { describe, expect, it } from "vitest";
import { formatearDinero, formatearFecha, hoyIso } from "./formato";

describe("formato", () => {
  it("formatea montos con separador de miles y dos decimales", () => {
    expect(formatearDinero("1234.5")).toBe("US$ 1,234.50");
    expect(formatearDinero("1234.5", { simbolo: false })).toBe("1,234.50");
    expect(formatearDinero("-340")).toBe("(US$ 340.00)");
  });

  it("muestra las fechas como dd/mm/aaaa", () => {
    expect(formatearFecha("2026-11-09")).toBe("09/11/2026");
    expect(formatearFecha("2026-11-09T00:00:00.000Z")).toBe("09/11/2026");
  });

  it("calcula la fecha de hoy con la hora local", () => {
    expect(hoyIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
