import { describe, expect, it } from "vitest";
import { motivoCuentaNoPermitida } from "./cuentas-permitidas";

describe("cuentas permitidas en una línea sin producto", () => {
  it("rechaza inventarios (1109…) y efectivo (1101…) en compras y ventas", () => {
    for (const operacion of ["compra", "venta"] as const) {
      expect(motivoCuentaNoPermitida(operacion, "1109")).toMatch(/inventarios/);
      expect(motivoCuentaNoPermitida(operacion, "110901")).toMatch(/inventarios/);
      expect(motivoCuentaNoPermitida(operacion, "110101")).toMatch(/caja o bancos/);
    }
  });

  it("una compra acepta gastos y activos; una venta solo ingresos (5…)", () => {
    expect(motivoCuentaNoPermitida("compra", "420101")).toBeNull();
    expect(motivoCuentaNoPermitida("compra", "120101")).toBeNull();
    expect(motivoCuentaNoPermitida("venta", "510101")).toBeNull();
    expect(motivoCuentaNoPermitida("venta", "420101")).toMatch(/ingresos/);
  });
});
