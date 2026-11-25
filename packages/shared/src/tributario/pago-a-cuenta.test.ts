import { describe, expect, it } from "vitest";
import { calcularPagoACuenta, CUENTAS_BASE_PAGO_A_CUENTA, CUENTAS_PAGO_A_CUENTA } from "./pago-a-cuenta";

describe("calcularPagoACuenta", () => {
  it("CheroPhonex, octubre de 2026: 1.75 % de US$ 46,051.20 es US$ 805.90", () => {
    const r = calcularPagoACuenta({
      ingresosBrutos: "46051.20",
      retencionesPlanilla: "0.00",
      retencionesServicios: "0.00",
    });
    expect(r).toMatchObject({ tasa: "1.75", pagoACuenta: "805.90", totalAEnterar: "805.90" });
  });

  it("redondea a centavos (medio hacia arriba) y suma las retenciones al total a enterar", () => {
    const r = calcularPagoACuenta({
      ingresosBrutos: "1000.00",
      retencionesPlanilla: "120.55",
      retencionesServicios: "30.10",
    });
    expect(r.pagoACuenta).toBe("17.50");
    expect(r.totalRetenciones).toBe("150.65");
    expect(r.totalAEnterar).toBe("168.15");
    expect(
      calcularPagoACuenta({ ingresosBrutos: "0.30", retencionesPlanilla: "0", retencionesServicios: "0" })
        .pagoACuenta,
    ).toBe("0.01");
  });

  it("un mes con devoluciones mayores que las ventas no genera pago a cuenta negativo", () => {
    const r = calcularPagoACuenta({
      ingresosBrutos: "-50.00",
      retencionesPlanilla: "0",
      retencionesServicios: "0",
    });
    expect(r.ingresosBrutos).toBe("0.00");
    expect(r.pagoACuenta).toBe("0.00");
  });

  it("acepta otra tasa", () => {
    expect(
      calcularPagoACuenta({
        ingresosBrutos: "200",
        retencionesPlanilla: "0",
        retencionesServicios: "0",
        tasa: "2",
      }).pagoACuenta,
    ).toBe("4.00");
  });

  it("la base suma ventas y otros ingresos (clase 52), resta 4103 y deja fuera 5202", () => {
    expect(CUENTAS_BASE_PAGO_A_CUENTA).toEqual(["5101", "52", "4103"]);
    expect(CUENTAS_PAGO_A_CUENTA.ingresosExcluidos).toEqual(["5202"]);
  });
});
