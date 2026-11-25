import { describe, expect, it } from "vitest";
import { armarAntiguedad, diasEntre, tramoDe, type SaldoDocumentoAl } from "./antiguedad.js";

const doc = (id: string, tercero: string, vence: string, saldo: string): SaldoDocumentoAl => ({
  documentoId: id,
  tipoDocumento: "ccf",
  numeroDocumento: id,
  fecha: "2026-06-01",
  fechaVencimiento: vence,
  sucursalId: "s1",
  tercero: { id: tercero, nombre: tercero.toUpperCase() },
  saldo,
});

describe("tramos de antigüedad (HU-63)", () => {
  it("los límites caen en el tramo correcto", () => {
    expect([-5, 0, 1, 30, 31, 60, 61, 90, 91, 400].map(tramoDe)).toEqual([
      "corriente",
      "corriente",
      "d1_30",
      "d1_30",
      "d31_60",
      "d31_60",
      "d61_90",
      "d61_90",
      "mas_90",
      "mas_90",
    ]);
  });

  it("cuenta días calendario sin zonas horarias, también al cruzar meses y años", () => {
    expect(diasEntre("2026-10-31", "2026-10-01")).toBe(30);
    expect(diasEntre("2027-01-05", "2026-12-25")).toBe(11);
    expect(diasEntre("2026-10-01", "2026-10-31")).toBe(-30);
  });
});

describe("armarAntiguedad", () => {
  const saldos = [
    doc("A", "tecno", "2026-11-15", "100.10"), // corriente
    doc("B", "tecno", "2026-10-25", "200.20"), // 6 días: 1-30
    doc("C", "tecno", "2026-08-01", "300.30"), // 91 días: más de 90
    doc("D", "zeta", "2026-09-15", "50.05"), // 46 días: 31-60
    doc("E", "zeta", "2026-10-01", "0.00"), // sin saldo: no aparece
  ];

  it("agrupa por cliente con sus tramos, ordena por nombre y los totales suman al centavo", () => {
    const r = armarAntiguedad("venta", "2026-10-31", saldos, { codigo: "1103", saldoMayor: "650.65" });
    expect(r.filas.map((f) => f.tercero.nombre)).toEqual(["TECNO", "ZETA"]);
    expect(r.filas[0]).toMatchObject({
      total: "600.60",
      tramos: { corriente: "100.10", d1_30: "200.20", d31_60: "0.00", d61_90: "0.00", mas_90: "300.30" },
    });
    expect(r.filas[0]!.documentos.map((d) => d.documentoId)).toEqual(["C", "B", "A"]);
    expect(r.filas[1]!.documentos).toHaveLength(1);
    expect(r.totales).toEqual({
      corriente: "100.10",
      d1_30: "200.20",
      d31_60: "50.05",
      d61_90: "0.00",
      mas_90: "300.30",
      total: "650.65",
    });
    // la suma de los tramos de cada fila es el total general
    expect(r.filas.reduce((s, f) => s + Number(f.total), 0).toFixed(2)).toBe(r.totales.total);
  });

  it("cuadra con el mayor y avisa la diferencia cuando no", () => {
    expect(
      armarAntiguedad("venta", "2026-10-31", saldos, { codigo: "1103", saldoMayor: "650.65" }).cuadre,
    ).toEqual({
      cuenta: "1103",
      saldoMayor: "650.65",
      saldoReporte: "650.65",
      diferencia: "0.00",
      cuadra: true,
    });
    expect(
      armarAntiguedad("venta", "2026-10-31", saldos, { codigo: "1103", saldoMayor: "700.00" }).cuadre,
    ).toMatchObject({ diferencia: "49.35", cuadra: false });
  });
});
