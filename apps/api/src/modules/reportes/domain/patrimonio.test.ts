// Armado del estado de cambios en el patrimonio (HU-40, S3-T19 y S3-T21).
import type { Naturaleza, TipoCuenta } from "@contable/shared";
import { describe, expect, it } from "vitest";
import type { FilaSaldos } from "./balanza.js";
import { armarBalanceGeneral } from "./estados.js";
import { armarCambiosPatrimonio, columnasPatrimonio } from "./patrimonio.js";

const TIPO: Record<string, TipoCuenta> = {
  "1": "activo",
  "2": "pasivo",
  "3": "patrimonio",
  "4": "costos_gastos",
  "5": "ingresos",
  "6": "liquidadora",
};

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
const valores = (
  e: ReturnType<typeof armarCambiosPatrimonio>,
  id: string,
): Record<string, string | undefined> =>
  Object.fromEntries(e.columnas.map((c, i) => [c.id, e.renglones.find((r) => r.id === id)?.valores[i]]));

describe("columnasPatrimonio", () => {
  it("persona natural: capital, utilidades y retiros; sociedad: capital social, reservas y utilidades", () => {
    expect(columnasPatrimonio("persona_natural").map((c) => c.id)).toEqual([
      "capital",
      "utilidades",
      "retiros",
    ]);
    expect(columnasPatrimonio("sociedad").map((c) => c.titulo)).toEqual([
      "Capital social",
      "Reservas",
      "Utilidades",
    ]);
  });
});

describe("armarCambiosPatrimonio: persona natural", () => {
  const filas = [
    fila("310101", "0", "22500.00"),
    fila("310801", "450.00", "0"),
    fila("510101", "0", "10000.00"),
    fila("420101", "2405.01", "0"),
  ];
  const e = armarCambiosPatrimonio(PERIODO, "persona_natural", filas);

  it("aportes, resultado y retiros dan el patrimonio final", () => {
    expect(valores(e, "aportes")).toEqual({ capital: "22500.00", utilidades: "0.00", retiros: "0.00" });
    expect(valores(e, "resultado")).toEqual({ capital: "0.00", utilidades: "7594.99", retiros: "0.00" });
    expect(valores(e, "retiros")).toEqual({ capital: "0.00", utilidades: "0.00", retiros: "-450.00" });
    expect(e.patrimonioFinal).toBe("29644.99");
  });

  it("omite los renglones de reservas y de otros movimientos cuando no hay importes", () => {
    expect(e.renglones.map((r) => r.id)).toEqual([
      "saldo-inicial",
      "aportes",
      "resultado",
      "retiros",
      "saldo-final",
    ]);
  });

  it("coincide con el patrimonio del balance general (con y sin cierre)", () => {
    const nombres = new Map<string, string>();
    const bg = armarBalanceGeneral({ fecha: "2026-10-31", sucursalId: null }, filas, nombres);
    expect(e.patrimonioFinal).toBe(bg.patrimonio.total);
  });

  it("el resultado de meses anteriores del ejercicio sin cerrar entra en el saldo inicial", () => {
    // Septiembre dejó una utilidad de 1,000.00 en las cuentas de resultado (saldo inicial acreedor)
    const con = armarCambiosPatrimonio(PERIODO, "persona_natural", [
      fila("310101", "0", "0", "-5000.00"),
      fila("510101", "0", "300.00", "-1000.00"),
    ]);
    expect(valores(con, "saldo-inicial")).toEqual({
      capital: "5000.00",
      utilidades: "1000.00",
      retiros: "0.00",
    });
    expect(con.patrimonioFinal).toBe("6300.00");
  });

  it("una pérdida resta de las utilidades", () => {
    const perdida = armarCambiosPatrimonio(PERIODO, "persona_natural", [
      fila("310101", "0", "1000.00"),
      fila("420101", "400.00", "0"),
    ]);
    expect(valores(perdida, "resultado").utilidades).toBe("-400.00");
    expect(perdida.patrimonioFinal).toBe("600.00");
  });
});

describe("armarCambiosPatrimonio: sociedad", () => {
  it("la reserva legal sale de las utilidades y los demás cargos a ellas son dividendos", () => {
    const e = armarCambiosPatrimonio(PERIODO, "sociedad", [
      fila("310101", "0", "0", "-10000.00"),
      fila("310301", "0", "700.00"), // reserva legal constituida
      fila("310501", "2700.00", "0", "-5000.00"), // 700 a la reserva y 2,000 de dividendos
      fila("510101", "0", "9000.00"),
    ]);
    expect(valores(e, "saldo-inicial")).toEqual({
      capital: "10000.00",
      reservas: "0.00",
      utilidades: "5000.00",
    });
    expect(valores(e, "reservas")).toEqual({ capital: "0.00", reservas: "700.00", utilidades: "-700.00" });
    expect(valores(e, "retiros")).toEqual({ capital: "0.00", reservas: "0.00", utilidades: "-2000.00" });
    expect(e.renglones.find((r) => r.id === "retiros")?.concepto).toBe("Retiros o dividendos");
    expect(valores(e, "saldo-final")).toEqual({
      capital: "10000.00",
      reservas: "700.00",
      utilidades: "11300.00",
    });
    expect(e.patrimonioFinal).toBe("22000.00");
  });

  it("un abono a las utilidades que no es resultado ni reserva se muestra como otros movimientos", () => {
    const e = armarCambiosPatrimonio(PERIODO, "sociedad", [fila("310501", "0", "300.00")]);
    expect(valores(e, "otros").utilidades).toBe("300.00");
    expect(e.patrimonioFinal).toBe("300.00");
  });
});
