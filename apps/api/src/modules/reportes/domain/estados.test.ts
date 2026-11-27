// Armado del estado de resultados (HU-37, S2-T42) y del balance general (HU-38, S2-T46 y S2-T48).
import type { Naturaleza, TipoCuenta } from "@contable/shared";
import { describe, expect, it } from "vitest";
import type { FilaSaldos } from "./balanza.js";
import { armarBalanceGeneral, armarEstadoResultados } from "./estados.js";

const NOMBRES = new Map([
  ["1101", "Efectivo y Equivalentes de Efectivo"],
  ["1109", "Inventarios"],
  ["1201", "Propiedad, Planta y Equipo"],
  ["1202", "(R) Depreciaciones"],
  ["2102", "Cuentas por Pagar Comerciales"],
  ["2201", "Préstamos por Pagar"],
  ["3101", "Capital"],
  ["3106", "Utilidad del Ejercicio"],
  ["4103", "(R) Devoluciones y Rebajas sobre Ventas"],
  ["4104", "Costo de Ventas"],
  ["4201", "Gastos de Administración"],
  ["4202", "Gastos de Venta"],
  ["4203", "Costos Financieros"],
  ["4204", "Gasto por Impuesto sobre la Renta Corriente"],
  ["4301", "Pérdidas en Venta de Activo de Explotación"],
  ["5101", "Ventas"],
  ["5201", "Ingresos Financieros"],
]);

const TIPO: Record<string, TipoCuenta> = {
  "1": "activo",
  "2": "pasivo",
  "3": "patrimonio",
  "4": "costos_gastos",
  "5": "ingresos",
  "6": "liquidadora",
};

/** Fila de la balanza: saldo inicial neto (deudor positivo) y movimientos del período. */
function fila(codigo: string, debe: string, haber: string, saldoInicial = "0"): FilaSaldos {
  const tipo = TIPO[codigo[0]!]!;
  const naturaleza: Naturaleza = tipo === "activo" || tipo === "costos_gastos" ? "deudora" : "acreedora";
  return {
    cuentaId: codigo,
    codigo,
    nombre: codigo,
    naturaleza,
    tipo,
    saldoInicial,
    movimientoDebe: debe,
    movimientoHaber: haber,
  };
}

const PERIODO = { desde: "2026-10-01", hasta: "2026-10-31", sucursalId: null };

describe("armarEstadoResultados (S2-T42)", () => {
  const filas = [
    fila("510101", "0", "1000.00"),
    fila("510102", "0", "500.00"),
    fila("410301", "50.00", "0"), // devoluciones sobre ventas: restan en las ventas
    fila("4104", "800.00", "0"),
    fila("420101", "120.50", "0"),
    fila("420201", "79.50", "0"),
    fila("420302", "10.00", "0"),
    fila("520101", "0", "30.00"),
    fila("430101", "20.00", "0"),
    fila("420401", "105.00", "0"),
    // Las cuentas de balance no entran
    fila("110101", "1500.00", "0"),
    fila("210201", "0", "200.00"),
  ];
  const e = armarEstadoResultados(PERIODO, filas, NOMBRES);

  it("agrupa por cuenta de mayor, con las complementarias restando en su sección", () => {
    expect(e.ventas).toEqual({
      titulo: "Ventas",
      renglones: [
        { codigo: "4103", nombre: "(R) Devoluciones y Rebajas sobre Ventas", monto: "-50.00" },
        { codigo: "5101", nombre: "Ventas", monto: "1500.00" },
      ],
      total: "1450.00",
    });
    expect(e.costoVentas.total).toBe("800.00");
    expect(e.gastosOperacion.renglones.map((r) => [r.codigo, r.monto])).toEqual([
      ["4201", "120.50"],
      ["4202", "79.50"],
    ]);
    // los costos financieros (4203) van a otros gastos, después de la utilidad de operación
    expect(e.otrosGastos.renglones.map((r) => [r.codigo, r.monto])).toContainEqual(["4203", "10.00"]);
  });

  it("calcula la utilidad bruta, de operación, antes de impuesto y neta", () => {
    expect(e).toMatchObject({
      utilidadBruta: "650.00", // 1450 − 800
      utilidadOperacion: "450.00", // 650 − 200 (sin los costos financieros de 10)
      otrosIngresos: { total: "30.00" },
      otrosGastos: { total: "30.00" }, // 20 + 10 de costos financieros (4203)
      utilidadAntesImpuesto: "450.00", // 450 + 30 − 30
      impuestoRenta: { total: "105.00" },
      utilidadNeta: "345.00",
    });
  });

  it("usa solo los movimientos del período, no el saldo acumulado del ejercicio", () => {
    const r = armarEstadoResultados(PERIODO, [fila("510101", "0", "100.00", "-900.00")], NOMBRES);
    expect(r.utilidadNeta).toBe("100.00");
  });

  it("una pérdida sale negativa y las secciones sin movimiento quedan vacías en cero", () => {
    const r = armarEstadoResultados(
      PERIODO,
      [fila("510101", "0", "100.00"), fila("420101", "250.00", "0")],
      NOMBRES,
    );
    expect(r.utilidadNeta).toBe("-150.00");
    expect(r.otrosIngresos).toEqual({ titulo: "Otros ingresos", renglones: [], total: "0.00" });
  });

  it("las cuentas fuera del catálogo base van a otros ingresos u otros gastos; la liquidadora no entra", () => {
    const r = armarEstadoResultados(
      PERIODO,
      [fila("5901", "0", "40.00"), fila("4901", "15.00", "0"), fila("6101", "0", "999.00")],
      NOMBRES,
    );
    expect(r.otrosIngresos.renglones).toEqual([{ codigo: "5901", nombre: "5901", monto: "40.00" }]);
    expect(r.otrosGastos.total).toBe("15.00");
    expect(r.utilidadNeta).toBe("25.00");
  });
});

describe("armarBalanceGeneral (S2-T46 y S2-T48)", () => {
  const CORTE = { fecha: "2026-10-31", sucursalId: null };

  it("separa corriente y no corriente; la depreciación resta dentro del activo no corriente", () => {
    const b = armarBalanceGeneral(
      CORTE,
      [
        fila("110101", "1000.00", "200.00", "500.00"), // saldo final 1,300
        fila("1109", "400.00", "0"),
        fila("120105", "2500.00", "0"),
        fila("120204", "0", "104.17"),
        fila("210201", "0", "300.00"),
        fila("220101", "0", "1000.00"),
        fila("310101", "0", "2500.00"),
        fila("3106", "0", "295.83"),
      ],
      NOMBRES,
    );
    expect(b.activoCorriente.renglones).toEqual([
      { codigo: "1101", nombre: "Efectivo y Equivalentes de Efectivo", monto: "1300.00" },
      { codigo: "1109", nombre: "Inventarios", monto: "400.00" },
    ]);
    expect(b.activoNoCorriente.renglones.map((r) => [r.codigo, r.monto])).toEqual([
      ["1201", "2500.00"],
      ["1202", "-104.17"],
    ]);
    expect(b).toMatchObject({
      totalActivo: "4095.83",
      pasivoCorriente: { total: "300.00" },
      pasivoNoCorriente: { total: "1000.00" },
      totalPasivo: "1300.00",
      patrimonio: { total: "2795.83" },
      totalPasivoPatrimonio: "4095.83",
      diferencia: "0.00",
      cuadra: true,
    });
  });

  it("antes del cierre suma el resultado de las cuentas de resultado como utilidad del ejercicio en curso", () => {
    const b = armarBalanceGeneral(
      CORTE,
      [
        fila("110101", "1500.00", "0"),
        fila("310101", "0", "1000.00"),
        fila("510101", "0", "800.00"),
        fila("420101", "300.00", "0"),
      ],
      NOMBRES,
    );
    expect(b.patrimonio.renglones).toEqual([
      { codigo: "3101", nombre: "Capital", monto: "1000.00" },
      { codigo: "", nombre: "Utilidad del ejercicio en curso", monto: "500.00" },
    ]);
    expect(b.cuadra).toBe(true);
  });

  it("con pérdida en curso la resta del patrimonio", () => {
    const b = armarBalanceGeneral(
      CORTE,
      [fila("110101", "700.00", "0"), fila("310101", "0", "1000.00"), fila("420101", "300.00", "0")],
      NOMBRES,
    );
    expect(b.patrimonio.renglones.at(-1)).toEqual({
      codigo: "",
      nombre: "Pérdida del ejercicio en curso",
      monto: "-300.00",
    });
    expect(b.cuadra).toBe(true);
  });

  it("después del cierre no agrega la utilidad en curso: ya está en el patrimonio", () => {
    const b = armarBalanceGeneral(
      CORTE,
      [fila("110101", "500.00", "0"), fila("3106", "0", "500.00"), fila("510101", "800.00", "800.00")],
      NOMBRES,
    );
    expect(b.patrimonio.renglones).toEqual([
      { codigo: "3106", nombre: "Utilidad del Ejercicio", monto: "500.00" },
    ]);
  });

  it("si el activo no es igual al pasivo más el patrimonio, indica la diferencia (S2-T48)", () => {
    const b = armarBalanceGeneral(
      CORTE,
      [fila("110101", "1000.00", "0"), fila("210201", "0", "300.00"), fila("310101", "0", "650.25")],
      NOMBRES,
    );
    expect(b).toMatchObject({
      totalActivo: "1000.00",
      totalPasivoPatrimonio: "950.25",
      diferencia: "49.75",
      cuadra: false,
    });
    // la diferencia lleva signo: negativa si el pasivo más el patrimonio es mayor
    const otro = armarBalanceGeneral(
      CORTE,
      [fila("110101", "10.00", "0"), fila("310101", "0", "10.01")],
      NOMBRES,
    );
    expect(otro).toMatchObject({ diferencia: "-0.01", cuadra: false });
  });
});
