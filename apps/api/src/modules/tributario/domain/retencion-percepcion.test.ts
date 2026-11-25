import { describe, expect, it } from "vitest";
import { armarRetencionesPercepciones, type DocumentoConUnoPorCiento } from "./retencion-percepcion.js";

const doc = (extra: Partial<DocumentoConUnoPorCiento>): DocumentoConUnoPorCiento => ({
  id: "d1",
  fecha: "2026-03-10",
  tipoDocumento: "ccf",
  numeroDocumento: "CCF-1",
  operacion: "compra",
  tercero: "Proveedor",
  clasificacionTercero: "grande",
  totalGravado: "1000.00",
  ivaPercibido: "0.00",
  ivaRetenido: "0.00",
  anulado: false,
  ...extra,
});

describe("armarRetencionesPercepciones", () => {
  it("clasifica cada monto como sufrido o efectuado según la operación", () => {
    const v = armarRetencionesPercepciones(2026, 3, "otro", [
      doc({ id: "a", numeroDocumento: "A", operacion: "compra", ivaPercibido: "10.00" }),
      doc({ id: "b", numeroDocumento: "B", operacion: "venta", ivaRetenido: "8.00" }),
      doc({ id: "c", numeroDocumento: "C", operacion: "compra", ivaRetenido: "5.00" }),
      doc({ id: "d", numeroDocumento: "D", operacion: "venta", ivaPercibido: "2.50" }),
    ]);
    expect(v.filas.map((f) => [f.numeroDocumento, f.tipo, f.sentido])).toEqual([
      ["A", "percepcion", "sufrida"],
      ["B", "retencion", "sufrida"],
      ["C", "retencion", "efectuada"],
      ["D", "percepcion", "efectuada"],
    ]);
    expect(v.totales).toEqual({
      percibidoSufrido: "10.00",
      retenidoSufrido: "8.00",
      percibidoEfectuado: "2.50",
      retenidoEfectuado: "5.00",
    });
  });

  it("un documento anulado se lista sin monto y no suma", () => {
    const v = armarRetencionesPercepciones(2026, 3, "otro", [
      doc({ ivaPercibido: "10.00", anulado: true }),
      doc({ id: "e", numeroDocumento: "CCF-2", ivaPercibido: "4.00" }),
    ]);
    expect(v.filas).toHaveLength(2);
    expect(v.filas[0]).toMatchObject({ anulado: true, monto: "0.00", baseGravada: "0.00" });
    expect(v.totales.percibidoSufrido).toBe("4.00");
  });

  it("los documentos sin 1 % no aparecen", () => {
    expect(armarRetencionesPercepciones(2026, 3, "otro", [doc({})]).filas).toEqual([]);
  });
});
