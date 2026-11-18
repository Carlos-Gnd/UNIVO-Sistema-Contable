import { describe, expect, it } from "vitest";
import { armarBalanza, separarSaldo, type FilaSaldos } from "./balanza.js";
import { Dinero } from "@contable/shared";

const fila = (
  codigo: string,
  saldoInicial: string,
  movimientoDebe: string,
  movimientoHaber: string,
  naturaleza: FilaSaldos["naturaleza"] = "deudora",
): FilaSaldos => ({
  cuentaId: `id-${codigo}`,
  codigo,
  nombre: `Cuenta ${codigo}`,
  naturaleza,
  tipo: "activo",
  saldoInicial,
  movimientoDebe,
  movimientoHaber,
});

const periodo = { desde: "2026-11-01", hasta: "2026-11-30", sucursalId: null };

describe("separarSaldo", () => {
  it("el saldo positivo es deudor, el negativo acreedor y el cero no tiene saldo", () => {
    expect(separarSaldo(Dinero.de("12.50"))).toEqual({ debe: Dinero.de("12.50"), haber: Dinero.cero() });
    expect(separarSaldo(Dinero.de("-12.50"))).toEqual({ debe: Dinero.cero(), haber: Dinero.de("12.50") });
    expect(separarSaldo(Dinero.cero())).toEqual({ debe: Dinero.cero(), haber: Dinero.cero() });
  });
});

describe("armarBalanza", () => {
  it("calcula el saldo final como inicial más movimientos y lo separa en deudor y acreedor", () => {
    const b = armarBalanza("ajustada", periodo, [
      fila("1101", "100.00", "50.25", "20.00"),
      fila("5101", "-100.00", "0", "30.25"),
    ]);
    expect(b.lineas).toMatchObject([
      {
        codigo: "1101",
        saldoInicialDebe: "100.00",
        saldoInicialHaber: "0.00",
        saldoFinalDebe: "130.25",
        saldoFinalHaber: "0.00",
      },
      {
        codigo: "5101",
        saldoInicialDebe: "0.00",
        saldoInicialHaber: "100.00",
        saldoFinalDebe: "0.00",
        saldoFinalHaber: "130.25",
      },
    ]);
    expect(b.totales).toEqual({
      saldoInicialDebe: "100.00",
      saldoInicialHaber: "100.00",
      movimientoDebe: "50.25",
      movimientoHaber: "50.25",
      saldoFinalDebe: "130.25",
      saldoFinalHaber: "130.25",
    });
    expect(b.cuadra).toBe(true);
    expect(b.diferencias).toEqual({ saldoInicial: "0.00", movimientos: "0.00", saldoFinal: "0.00" });
    expect(b.titulo).toBe("Balanza de comprobación ajustada");
  });

  it("una cuenta que cambia de lado queda en la columna contraria", () => {
    const b = armarBalanza("antes-ajustes", periodo, [fila("1101", "10.00", "0", "25.00")]);
    expect(b.lineas[0]).toMatchObject({
      saldoFinalDebe: "0.00",
      saldoFinalHaber: "15.00",
      saldoContrario: true,
    });
  });

  it("marca como contrarios los saldos deudores acreedores y acreedores deudores, pero no el cero", () => {
    const b = armarBalanza("antes-ajustes", periodo, [
      fila("1101", "0", "0", "10.00", "deudora"),
      fila("2101", "0", "10.00", "0", "acreedora"),
      fila("3101", "0", "0", "0", "acreedora"),
      fila("4101", "0", "0", "10.00", "acreedora"),
    ]);
    expect(b.lineas.map((linea) => [linea.codigo, linea.saldoContrario])).toEqual([
      ["1101", true],
      ["2101", true],
      ["4101", false],
    ]);
  });

  it("indica la diferencia de cada sección cuando el debe y el haber no son iguales", () => {
    const b = armarBalanza("antes-ajustes", periodo, [
      fila("1101", "0", "100.00", "0"),
      fila("5101", "0", "0", "90.30"),
    ]);
    expect(b.cuadra).toBe(false);
    expect(b.diferencias).toEqual({ saldoInicial: "0.00", movimientos: "9.70", saldoFinal: "9.70" });
  });

  it("omite las cuentas sin saldo ni movimiento y ordena los códigos jerárquicos como texto", () => {
    const b = armarBalanza("posterior-cierre", periodo, [
      fila("110101", "0", "10.00", "0"),
      fila("1102", "0", "0", "0"),
      fila("11010", "0", "5.00", "0"),
      fila("5101", "0", "0", "15.00"),
    ]);
    expect(b.lineas.map((l) => l.codigo)).toEqual(["11010", "110101", "5101"]);
    expect(b.lineas.map((l) => l.codigo)).not.toContain("1102");
  });

  it("conserva una cuenta cuyo saldo final es cero pero tuvo movimiento", () => {
    const b = armarBalanza("posterior-cierre", periodo, [fila("5101", "-40.00", "40.00", "0")]);
    expect(b.lineas).toHaveLength(1);
    expect(b.lineas[0]).toMatchObject({ saldoFinalDebe: "0.00", saldoFinalHaber: "0.00" });
  });

  it("suma con precisión decimal: 0.10 diez veces es exactamente 1.00", () => {
    const filas = Array.from({ length: 10 }, (_, i) =>
      fila(`11${String(i).padStart(2, "0")}`, "0", "0.10", "0"),
    );
    const b = armarBalanza("antes-ajustes", periodo, [...filas, fila("5101", "0", "0", "1.00")]);
    expect(b.totales.movimientoDebe).toBe("1.00");
    expect(b.cuadra).toBe(true);
  });

  it("sin cuentas con movimiento devuelve una balanza vacía que cuadra", () => {
    const b = armarBalanza("ajustada", { ...periodo, sucursalId: "s1" }, []);
    expect(b.lineas).toEqual([]);
    expect(b.cuadra).toBe(true);
    expect(b.sucursalId).toBe("s1");
  });
});
