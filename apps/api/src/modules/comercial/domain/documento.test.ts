import { describe, expect, it } from "vitest";
import { Dinero, calcularTotalesDocumento } from "@contable/shared";
import { agruparPorCuenta, armarPartidaCompra, sumarDias } from "./documento.js";

const cuentas = { creditoFiscalId: "cf", ivaPercibidoId: "pe", ivaRetenidoId: "re", contrapartidaId: "cxp" };

describe("partida de una compra", () => {
  it("compra de mercadería de CheroPhonex: inventario 40,000.00, crédito fiscal 5,200.00 y cuentas por pagar", () => {
    const totales = calcularTotalesDocumento({
      operacion: "compra",
      tipoDocumento: "ccf",
      lineas: [{ monto: "40000.00", clase: "gravada" }],
      empresa: "otro",
      tercero: "otro",
    });
    const lineas = armarPartidaCompra([{ cuentaId: "inv", monto: "40000.00" }], totales, cuentas, "Compra");
    expect(lineas.map((l) => [l.cuentaId, l.debe, l.haber])).toEqual([
      ["inv", "40000.00", "0.00"],
      ["cf", "5200.00", "0.00"],
      ["cxp", "0.00", "45200.00"],
    ]);
  });

  it("cuadra con IVA retenido: el pago es el total menos la retención", () => {
    const totales = calcularTotalesDocumento({
      operacion: "compra",
      tipoDocumento: "ccf",
      lineas: [{ monto: "1000.00", clase: "gravada" }],
      empresa: "grande",
      tercero: "otro",
    });
    const lineas = armarPartidaCompra([{ cuentaId: "inv", monto: "1000.00" }], totales, cuentas, "Compra");
    expect(lineas.map((l) => [l.cuentaId, l.debe, l.haber])).toEqual([
      ["inv", "1000.00", "0.00"],
      ["cf", "130.00", "0.00"],
      ["cxp", "0.00", "1120.00"],
      ["re", "0.00", "10.00"],
    ]);
    const debe = Dinero.sumar(lineas.map((l) => l.debe));
    const haber = Dinero.sumar(lineas.map((l) => l.haber));
    expect(debe.igualA(haber)).toBe(true);
  });

  it("cuadra con IVA percibido y con una factura sin crédito fiscal", () => {
    const percibido = calcularTotalesDocumento({
      operacion: "compra",
      tipoDocumento: "ccf",
      lineas: [{ monto: "500.00", clase: "gravada" }],
      empresa: "otro",
      tercero: "grande",
    });
    const l1 = armarPartidaCompra([{ cuentaId: "inv", monto: "500.00" }], percibido, cuentas, "Compra");
    expect(l1.map((l) => [l.cuentaId, l.debe, l.haber])).toEqual([
      ["inv", "500.00", "0.00"],
      ["cf", "65.00", "0.00"],
      ["pe", "5.00", "0.00"],
      ["cxp", "0.00", "570.00"],
    ]);
    const factura = calcularTotalesDocumento({
      operacion: "compra",
      tipoDocumento: "factura",
      lineas: [{ monto: "113.00", clase: "gravada" }],
      empresa: "otro",
      tercero: "otro",
    });
    expect(armarPartidaCompra([{ cuentaId: "gas", monto: "113.00" }], factura, cuentas, "x")).toHaveLength(2);
  });
});

describe("utilidades", () => {
  it("agrupa los débitos por cuenta sin perder el orden ni los centavos", () => {
    expect(
      agruparPorCuenta([
        { cuentaId: "a", monto: "0.10" },
        { cuentaId: "b", monto: "5.00" },
        { cuentaId: "a", monto: "0.20" },
      ]),
    ).toEqual([
      { cuentaId: "a", monto: "0.30" },
      { cuentaId: "b", monto: "5.00" },
    ]);
  });

  it("suma días a una fecha cruzando meses y años", () => {
    expect(sumarDias("2026-10-31", 30)).toBe("2026-11-30");
    expect(sumarDias("2026-12-15", 30)).toBe("2027-01-14");
    expect(sumarDias("2026-10-31", 0)).toBe("2026-10-31");
  });
});
