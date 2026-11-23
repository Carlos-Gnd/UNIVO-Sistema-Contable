import { describe, expect, it } from "vitest";
import {
  ExistenciaInsuficienteError,
  ExistenciasProducto,
  armarKardex,
  costoTotalDeEntrada,
  type MovimientoParaKardex,
} from "./valuacion";

const entrada = (id: string, fecha: string, cantidad: string, costoTotal: string): MovimientoParaKardex => ({
  id,
  fecha,
  tipo: "entrada",
  cantidad,
  costoTotal,
  referencia: null,
});
const salida = (id: string, fecha: string, cantidad: string): MovimientoParaKardex => ({
  id,
  fecha,
  tipo: "salida",
  cantidad,
  costoTotal: "0.00",
  referencia: null,
});

describe("costo promedio ponderado", () => {
  it("promedia las entradas y valúa las salidas al promedio vigente", () => {
    const e = new ExistenciasProducto("promedio_ponderado");
    e.entrada("10", "100.00"); // 10 a 10.00
    e.entrada("10", "120.00"); // 10 a 12.00 -> promedio 11.00
    expect(e.saldo()).toEqual({ cantidad: "20.0000", costoTotal: "220.00", costoUnitario: "11.0000" });
    expect(e.salida("5")).toBe("55.00");
    expect(e.saldo()).toEqual({ cantidad: "15.0000", costoTotal: "165.00", costoUnitario: "11.0000" });
  });

  it("recalcula el promedio con cada entrada nueva después de salidas", () => {
    const e = new ExistenciasProducto("promedio_ponderado");
    e.entrada("10", "100.00");
    e.salida("4"); // 40.00, quedan 6 a 10.00
    e.entrada("4", "60.00"); // 10 en total por 120.00 -> 12.00
    expect(e.saldo()).toEqual({ cantidad: "10.0000", costoTotal: "120.00", costoUnitario: "12.0000" });
  });

  it("al agotar las existencias se lleva el valor completo y no quedan centavos sueltos", () => {
    const e = new ExistenciasProducto("promedio_ponderado");
    e.entrada("3", "10.00"); // 3.3333 por unidad
    const costos = [e.salida("1"), e.salida("1"), e.salida("1")];
    expect(costos).toEqual(["3.33", "3.34", "3.33"]);
    expect(costos.reduce((a, c) => a + Number(c), 0).toFixed(2)).toBe("10.00");
    expect(e.saldo()).toEqual({ cantidad: "0.0000", costoTotal: "0.00", costoUnitario: "0.0000" });
  });
});

describe("PEPS", () => {
  it("las salidas consumen primero las entradas más antiguas", () => {
    const e = new ExistenciasProducto("peps");
    e.entrada("10", "100.00");
    e.entrada("10", "120.00");
    // 10 a 10.00 y 5 a 12.00
    expect(e.salida("15")).toBe("160.00");
    expect(e.saldo()).toEqual({ cantidad: "5.0000", costoTotal: "60.00", costoUnitario: "12.0000" });
  });

  it("una salida parcial de una capa deja el resto de esa capa a su costo", () => {
    const e = new ExistenciasProducto("peps");
    e.entrada("4", "10.00");
    e.entrada("4", "20.00");
    expect(e.salida("2")).toBe("5.00");
    expect(e.saldo().costoTotal).toBe("25.00");
    expect(e.salida("4")).toBe("15.00"); // 2 restantes a 2.50 y 2 a 5.00
  });

  it("con costos distintos da un resultado diferente al promedio", () => {
    const promedio = new ExistenciasProducto("promedio_ponderado");
    const peps = new ExistenciasProducto("peps");
    for (const e of [promedio, peps]) {
      e.entrada("10", "100.00");
      e.entrada("10", "200.00");
    }
    expect(promedio.salida("10")).toBe("150.00");
    expect(peps.salida("10")).toBe("100.00");
  });
});

describe("reglas de las existencias", () => {
  it("no permite sacar más de lo que hay", () => {
    const e = new ExistenciasProducto("peps");
    e.entrada("5", "50.00");
    expect(() => e.salida("6")).toThrow(ExistenciaInsuficienteError);
    expect(e.saldo().cantidad).toBe("5.0000");
  });

  it("rechaza cantidades en cero o negativas", () => {
    const e = new ExistenciasProducto("peps");
    expect(() => e.entrada("0", "10.00")).toThrow();
    expect(() => e.entrada("-1", "10.00")).toThrow();
    e.entrada("1", "10.00");
    expect(() => e.salida("0")).toThrow();
  });

  it("acepta cantidades fraccionarias de hasta cuatro decimales", () => {
    const e = new ExistenciasProducto("promedio_ponderado");
    e.entrada("2.5", "25.00");
    expect(e.salida("0.5")).toBe("5.00");
    expect(e.saldo()).toEqual({ cantidad: "2.0000", costoTotal: "20.00", costoUnitario: "10.0000" });
  });

  it("el costo de una entrada es cantidad por costo unitario al centavo", () => {
    expect(costoTotalDeEntrada("8", "590")).toBe("4720.00");
    expect(costoTotalDeEntrada("3", "3.3333")).toBe("10.00");
    expect(costoTotalDeEntrada("2.5", "1.0050")).toBe("2.51");
  });
});

describe("armarKardex", () => {
  const movimientos = [
    entrada("m1", "2026-10-04", "8", "4720.00"),
    salida("m2", "2026-10-08", "2"),
    salida("m3", "2026-10-15", "3"),
    entrada("m4", "2026-10-20", "4", "2400.00"),
  ];

  it("muestra entradas, salidas y saldo en unidades y valores", () => {
    const k = armarKardex(movimientos, "promedio_ponderado");
    expect(k.saldoInicial).toEqual({ cantidad: "0.0000", costoTotal: "0.00", costoUnitario: "0.0000" });
    expect(
      k.lineas.map((l) => [
        l.fecha,
        l.entrada?.costoTotal ?? null,
        l.salida?.costoTotal ?? null,
        l.saldo.costoTotal,
      ]),
    ).toEqual([
      ["2026-10-04", "4720.00", null, "4720.00"],
      ["2026-10-08", null, "1180.00", "3540.00"],
      ["2026-10-15", null, "1770.00", "1770.00"],
      ["2026-10-20", "2400.00", null, "4170.00"],
    ]);
    expect(k.lineas[1]!.salida).toEqual({
      cantidad: "2.0000",
      costoUnitario: "590.0000",
      costoTotal: "1180.00",
    });
    expect(k.totales).toEqual({
      entradaCantidad: "12.0000",
      entradaTotal: "7120.00",
      salidaCantidad: "5.0000",
      salidaTotal: "2950.00",
    });
    expect(k.saldoFinal).toEqual({ cantidad: "7.0000", costoTotal: "4170.00", costoUnitario: "595.7143" });
  });

  it("con un rango, lo anterior forma el saldo inicial y lo posterior no aparece", () => {
    const k = armarKardex(movimientos, "promedio_ponderado", { desde: "2026-10-10", hasta: "2026-10-16" });
    expect(k.saldoInicial).toEqual({ cantidad: "6.0000", costoTotal: "3540.00", costoUnitario: "590.0000" });
    expect(k.lineas.map((l) => l.id)).toEqual(["m3"]);
    expect(k.saldoFinal).toEqual({ cantidad: "3.0000", costoTotal: "1770.00", costoUnitario: "590.0000" });
  });

  it("un rango sin movimientos conserva el saldo en ambos extremos", () => {
    const k = armarKardex(movimientos, "peps", { desde: "2026-10-21", hasta: "2026-10-31" });
    expect(k.lineas).toEqual([]);
    expect(k.saldoInicial).toEqual(k.saldoFinal);
  });

  it("el método cambia el valor de las salidas cuando los costos difieren", () => {
    const m = [
      entrada("a", "2026-01-01", "10", "100.00"),
      entrada("b", "2026-01-02", "10", "200.00"),
      salida("c", "2026-01-03", "10"),
    ];
    expect(armarKardex(m, "promedio_ponderado").totales.salidaTotal).toBe("150.00");
    expect(armarKardex(m, "peps").totales.salidaTotal).toBe("100.00");
  });
});
