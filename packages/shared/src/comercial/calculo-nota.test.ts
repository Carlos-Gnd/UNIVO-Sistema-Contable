import { describe, expect, it } from "vitest";
import { calcularTotalesDocumento } from "./calculo-documento";
import { calcularTotalesNota } from "./calculo-nota";

const venta = (monto: string, tipoDocumento: "ccf" | "factura" = "ccf") => ({
  operacion: "venta" as const,
  tipoDocumento,
  lineas: [{ monto, clase: "gravada" as const }],
  empresa: "otro" as const,
  tercero: "grande" as const,
});

describe("totales de una nota (HU-61)", () => {
  it("sin retención ni percepción en el documento, es el cálculo del documento", () => {
    const doc = calcularTotalesDocumento({ ...venta("1000.00"), tercero: "otro" });
    const nota = calcularTotalesNota({ ...venta("100.00"), tercero: "otro" }, doc);
    expect(nota).toMatchObject({
      totalGravado: "100.00",
      iva: "13.00",
      total: "113.00",
      totalNeto: "113.00",
    });
  });

  it("revierte la retención del 1 % del cliente gran contribuyente aunque la nota no llegue a US$ 100", () => {
    const doc = calcularTotalesDocumento(venta("1000.00"));
    expect(doc.ivaRetenido).toBe("10.00");
    // sola, una nota de 50.00 no retiene; con el documento como referencia sí, para que el saldo baje lo cobrado
    expect(calcularTotalesDocumento(venta("50.00")).ivaRetenido).toBe("0.00");
    const nota = calcularTotalesNota(venta("50.00"), doc);
    expect(nota).toMatchObject({ iva: "6.50", ivaRetenido: "0.50", total: "56.50", totalNeto: "56.00" });
  });

  it("las devoluciones parciales suman exactamente lo retenido en el documento", () => {
    const doc = calcularTotalesDocumento(venta("1000.00"));
    const mitad = calcularTotalesNota(venta("500.00"), doc);
    expect(mitad.ivaRetenido).toBe("5.00");
    expect(mitad.totalNeto).toBe("560.00");
  });

  it("una factura de consumidor final no lleva retención ni percepción", () => {
    const doc = calcularTotalesDocumento({ ...venta("113.00", "factura"), tercero: "otro" });
    const nota = calcularTotalesNota({ ...venta("56.50", "factura"), tercero: "otro" }, doc);
    expect(nota).toMatchObject({ totalGravado: "50.00", iva: "6.50", total: "56.50", ivaRetenido: "0.00" });
  });
});
