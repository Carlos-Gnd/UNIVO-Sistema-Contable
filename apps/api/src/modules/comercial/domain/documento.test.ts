import { describe, expect, it } from "vitest";
import { Dinero, calcularTotalesDocumento } from "@contable/shared";
import {
  agruparPorCuenta,
  armarPartidaCompra,
  armarPartidaCosto,
  armarPartidaVenta,
  creditosDeVenta,
  motivoCuentaNoPermitida,
  sumarDias,
} from "./documento.js";

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

describe("partida de una venta", () => {
  const cuentasVenta = { cobroId: "caja", debitoFiscalId: "df", ivaPercibidoId: "pp", ivaRetenidoId: "rr" };

  it("venta de CheroPhonex con CCF-0001: caja 3,096.77 contra ventas 2,740.50 e IVA débito 356.27", () => {
    const totales = calcularTotalesDocumento({
      operacion: "venta",
      tipoDocumento: "ccf",
      lineas: [{ monto: "2740.50", clase: "gravada" }],
      empresa: "otro",
      tercero: "otro",
    });
    const lineas = armarPartidaVenta([{ cuentaId: "ven", monto: "2740.50" }], totales, cuentasVenta, "Venta");
    expect(lineas.map((l) => [l.cuentaId, l.debe, l.haber])).toEqual([
      ["caja", "3096.77", "0.00"],
      ["ven", "0.00", "2740.50"],
      ["df", "0.00", "356.27"],
    ]);
  });

  it("con retención del cliente y percepción propia la partida cuadra", () => {
    const retenido = calcularTotalesDocumento({
      operacion: "venta",
      tipoDocumento: "ccf",
      lineas: [{ monto: "1000.00", clase: "gravada" }],
      empresa: "otro",
      tercero: "grande",
    });
    const l1 = armarPartidaVenta([{ cuentaId: "ven", monto: "1000.00" }], retenido, cuentasVenta, "x");
    expect(l1.map((l) => [l.cuentaId, l.debe, l.haber])).toEqual([
      ["caja", "1120.00", "0.00"],
      ["rr", "10.00", "0.00"],
      ["ven", "0.00", "1000.00"],
      ["df", "0.00", "130.00"],
    ]);
    const percibido = calcularTotalesDocumento({
      operacion: "venta",
      tipoDocumento: "ccf",
      lineas: [{ monto: "1000.00", clase: "gravada" }],
      empresa: "grande",
      tercero: "otro",
    });
    const l2 = armarPartidaVenta([{ cuentaId: "ven", monto: "1000.00" }], percibido, cuentasVenta, "x");
    expect(Dinero.sumar(l2.map((l) => l.debe)).igualA(Dinero.sumar(l2.map((l) => l.haber)))).toBe(true);
    expect(l2.at(-1)).toMatchObject({ cuentaId: "pp", haber: "10.00" });
  });

  it("factura de consumidor final: separa la base del IVA y el residuo de centavos cuadra la partida", () => {
    const lineas = [
      { cuentaId: "ven", monto: "99.99", clase: "gravada" as const },
      { cuentaId: "ven", monto: "33.33", clase: "gravada" as const },
      { cuentaId: "exe", monto: "10.00", clase: "exenta" as const },
    ];
    const totales = calcularTotalesDocumento({
      operacion: "venta",
      tipoDocumento: "factura",
      lineas: lineas.map((l) => ({ monto: l.monto, clase: l.clase })),
      empresa: "otro",
      tercero: "otro",
    });
    const creditos = creditosDeVenta(lineas, "factura", totales);
    const partida = armarPartidaVenta(creditos, totales, cuentasVenta, "x");
    expect(Dinero.sumar(partida.map((l) => l.debe)).igualA(Dinero.sumar(partida.map((l) => l.haber)))).toBe(
      true,
    );
    expect(
      Dinero.sumar(creditos.filter((_, i) => lineas[i]!.clase === "gravada").map((c) => c.monto)).aTexto(),
    ).toBe(totales.totalGravado);
  });

  it("el CCF acredita los importes de las líneas tal cual", () => {
    const totales = calcularTotalesDocumento({
      operacion: "venta",
      tipoDocumento: "ccf",
      lineas: [{ monto: "10.00", clase: "gravada" }],
      empresa: "otro",
      tercero: "otro",
    });
    expect(creditosDeVenta([{ cuentaId: "a", monto: "10.00", clase: "gravada" }], "ccf", totales)).toEqual([
      { cuentaId: "a", monto: "10.00" },
    ]);
  });

  it("la partida del costo mueve el valor del kardex de inventarios a costo de ventas", () => {
    expect(
      armarPartidaCosto("2030.00", { costoVentasId: "cv", inventarioId: "inv" }, "x").map((l) => [
        l.cuentaId,
        l.debe,
        l.haber,
      ]),
    ).toEqual([
      ["cv", "2030.00", "0.00"],
      ["inv", "0.00", "2030.00"],
    ]);
  });
});

describe("cuentas permitidas en una línea sin producto", () => {
  it("en una compra rechaza inventarios (1109…) y efectivo (1101…), pero acepta un gasto o un activo", () => {
    expect(motivoCuentaNoPermitida("compra", "110901")).toMatch(/inventarios/);
    expect(motivoCuentaNoPermitida("compra", "1109")).toMatch(/inventarios/);
    expect(motivoCuentaNoPermitida("compra", "110101")).toMatch(/caja o bancos/);
    expect(motivoCuentaNoPermitida("compra", "420101")).toBeNull();
    expect(motivoCuentaNoPermitida("compra", "120101")).toBeNull();
  });

  it("en una venta exige una cuenta de ingresos (5…)", () => {
    expect(motivoCuentaNoPermitida("venta", "510101")).toBeNull();
    expect(motivoCuentaNoPermitida("venta", "4101")).toMatch(/ingresos/);
    expect(motivoCuentaNoPermitida("venta", "110901")).toMatch(/inventarios/);
    expect(motivoCuentaNoPermitida("venta", "110101")).toMatch(/caja o bancos/);
  });
});
