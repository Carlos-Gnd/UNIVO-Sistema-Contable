import { describe, expect, it } from "vitest";
import { cifrasPorMes, mesSiguiente, type FilaAgregadaIva } from "./liquidacion-iva.js";

const fila = (
  mes: string,
  operacion: FilaAgregadaIva["operacion"],
  tipoDocumento: FilaAgregadaIva["tipoDocumento"],
  iva: string,
  ivaPercibido = "0.00",
  ivaRetenido = "0.00",
): FilaAgregadaIva => ({ mes, operacion, tipoDocumento, iva, ivaPercibido, ivaRetenido });

describe("cifrasPorMes", () => {
  it("separa el débito de contribuyentes y de consumidor final y toma el crédito de las compras", () => {
    const [octubre] = cifrasPorMes(
      [
        fila("2026-10", "venta", "ccf", "3331.00"),
        fila("2026-10", "venta", "factura", "2655.67"),
        fila("2026-10", "compra", "ccf", "5343.00"),
        fila("2026-10", "compra", "factura", "0.00"),
      ],
      "2026-10",
    );
    expect(octubre?.cifras).toMatchObject({
      debitoContribuyentes: "3331.00",
      debitoConsumidorFinal: "2655.67",
      debitoFiscal: "5986.67",
      creditoFiscal: "5343.00",
    });
  });

  it("distingue la retención y percepción sufridas de las efectuadas", () => {
    const [mes] = cifrasPorMes(
      [
        fila("2026-03", "compra", "ccf", "130.00", "10.00", "0.00"),
        fila("2026-03", "compra", "ccf", "26.00", "0.00", "2.00"),
        fila("2026-03", "venta", "ccf", "104.00", "1.50", "8.00"),
      ],
      "2026-03",
    );
    expect(mes?.cifras).toMatchObject({
      percibidoSufrido: "10.00",
      retenidoSufrido: "8.00",
      percibidoEfectuado: "1.50",
      retenidoEfectuado: "2.00",
    });
  });

  it("llena con ceros los meses sin documentos entre el primero y el consultado", () => {
    const meses = cifrasPorMes([fila("2026-11", "compra", "ccf", "130.00")], "2027-02");
    expect(meses.map((m) => m.mes)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(meses[2]?.cifras.creditoFiscal).toBe("0.00");
  });

  it("sin documentos hasta el mes consultado no hay meses que liquidar", () => {
    expect(cifrasPorMes([], "2026-10")).toEqual([]);
    expect(cifrasPorMes([fila("2026-11", "venta", "ccf", "13.00")], "2026-10")).toEqual([]);
  });
});

describe("mesSiguiente", () => {
  it("pasa de diciembre a enero del año siguiente", () => {
    expect(mesSiguiente("2026-12")).toBe("2027-01");
    expect(mesSiguiente("2026-09")).toBe("2026-10");
  });
});
