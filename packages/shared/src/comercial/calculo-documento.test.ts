import { describe, expect, it } from "vitest";
import { calcularTotalesDocumento, type EntradaCalculoDocumento } from "./calculo-documento";

const base = (extra: Partial<EntradaCalculoDocumento>): EntradaCalculoDocumento => ({
  operacion: "compra",
  tipoDocumento: "ccf",
  lineas: [{ monto: "1000.00", clase: "gravada" }],
  empresa: "otro",
  tercero: "otro",
  ...extra,
});

describe("totales de un CCF", () => {
  it("el IVA es el 13 % de lo gravado y el total lo suma", () => {
    expect(calcularTotalesDocumento(base({}))).toEqual({
      totalGravado: "1000.00",
      totalExento: "0.00",
      totalNoSujeto: "0.00",
      iva: "130.00",
      ivaPercibido: "0.00",
      ivaRetenido: "0.00",
      total: "1130.00",
      totalNeto: "1130.00",
    });
  });

  it("separa lo gravado de lo exento y lo no sujeto, y el IVA solo grava lo gravado", () => {
    const t = calcularTotalesDocumento(
      base({
        lineas: [
          { monto: "200.00", clase: "gravada" },
          { monto: "50.00", clase: "exenta" },
          { monto: "25.50", clase: "no_sujeta" },
        ],
      }),
    );
    expect(t).toMatchObject({
      totalGravado: "200.00",
      totalExento: "50.00",
      totalNoSujeto: "25.50",
      iva: "26.00",
    });
    expect(t.total).toBe("301.50");
  });

  it("calcula al centavo con redondeo hacia arriba (CCF-0001 de CheroPhonex: 2,740.50 + 356.27)", () => {
    const t = calcularTotalesDocumento(
      base({ operacion: "venta", lineas: [{ monto: "2740.50", clase: "gravada" }] }),
    );
    expect(t.iva).toBe("356.27");
    expect(t.total).toBe("3096.77");
  });
});

describe("factura de consumidor final", () => {
  it("en una venta el precio incluye el IVA: se separa la base y el IVA del total", () => {
    const t = calcularTotalesDocumento(
      base({ operacion: "venta", tipoDocumento: "factura", lineas: [{ monto: "113.00", clase: "gravada" }] }),
    );
    expect(t).toMatchObject({ totalGravado: "100.00", iva: "13.00", total: "113.00" });
  });

  it("la base se redondea al centavo y el IVA es la diferencia, así el total no cambia", () => {
    const t = calcularTotalesDocumento(
      base({ operacion: "venta", tipoDocumento: "factura", lineas: [{ monto: "99.99", clase: "gravada" }] }),
    );
    expect(t.totalGravado).toBe("88.49");
    expect(t.iva).toBe("11.50");
    expect(t.total).toBe("99.99");
  });

  it("en una compra no da crédito fiscal: el IVA forma parte del costo", () => {
    const t = calcularTotalesDocumento(
      base({ tipoDocumento: "factura", lineas: [{ monto: "113.00", clase: "gravada" }] }),
    );
    expect(t).toMatchObject({ totalGravado: "113.00", iva: "0.00", total: "113.00" });
  });
});

describe("exportación", () => {
  it("no lleva IVA", () => {
    const t = calcularTotalesDocumento(
      base({
        operacion: "venta",
        tipoDocumento: "exportacion",
        lineas: [{ monto: "500.00", clase: "exenta" }],
      }),
    );
    expect(t).toMatchObject({ totalGravado: "0.00", totalExento: "500.00", iva: "0.00", total: "500.00" });
  });
});

describe("retención y percepción del 1 % de IVA", () => {
  it("compra: la empresa gran contribuyente retiene al proveedor que no lo es", () => {
    const t = calcularTotalesDocumento(base({ empresa: "grande" }));
    expect(t.ivaRetenido).toBe("10.00");
    expect(t.total).toBe("1130.00");
    expect(t.totalNeto).toBe("1120.00");
  });

  it("compra: un proveedor gran contribuyente percibe el 1 % y se suma al documento", () => {
    const t = calcularTotalesDocumento(base({ tercero: "grande" }));
    expect(t.ivaPercibido).toBe("10.00");
    expect(t.total).toBe("1140.00");
    expect(t.totalNeto).toBe("1140.00");
  });

  it("venta: la empresa gran contribuyente percibe y el cliente gran contribuyente retiene", () => {
    expect(calcularTotalesDocumento(base({ operacion: "venta", empresa: "grande" })).ivaPercibido).toBe(
      "10.00",
    );
    const t = calcularTotalesDocumento(base({ operacion: "venta", tercero: "grande" }));
    expect(t.ivaRetenido).toBe("10.00");
    expect(t.totalNeto).toBe("1120.00");
  });

  it("no aplica entre dos grandes contribuyentes, entre dos que no lo son ni con base menor de US$ 100", () => {
    expect(calcularTotalesDocumento(base({ empresa: "grande", tercero: "grande" }))).toMatchObject({
      ivaRetenido: "0.00",
      ivaPercibido: "0.00",
    });
    expect(calcularTotalesDocumento(base({ empresa: "mediano", tercero: "otro" })).ivaRetenido).toBe("0.00");
    const poco = calcularTotalesDocumento(
      base({ empresa: "grande", lineas: [{ monto: "99.99", clase: "gravada" }] }),
    );
    expect(poco.ivaRetenido).toBe("0.00");
    expect(
      calcularTotalesDocumento(base({ empresa: "grande", lineas: [{ monto: "100.00", clase: "gravada" }] }))
        .ivaRetenido,
    ).toBe("1.00");
  });

  it("no aplica a una factura de consumidor final", () => {
    const t = calcularTotalesDocumento(
      base({
        operacion: "venta",
        tipoDocumento: "factura",
        empresa: "grande",
        lineas: [{ monto: "1130.00", clase: "gravada" }],
      }),
    );
    expect(t.ivaPercibido).toBe("0.00");
  });
});
