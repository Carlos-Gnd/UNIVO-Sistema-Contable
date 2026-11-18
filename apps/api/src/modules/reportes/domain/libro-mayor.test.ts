import { describe, expect, it } from "vitest";
import { armarLibroMayor, type DatosCuentaLibroMayor } from "./libro-mayor.js";

const cuenta: DatosCuentaLibroMayor = {
  cuentaId: "c1",
  codigo: "1101",
  nombre: "Caja",
  naturaleza: "deudora",
  movimientos: [
    {
      fecha: "2026-01-05",
      partidaId: "p1",
      numero: 1,
      tipo: "apertura",
      concepto: "Saldo inicial",
      sucursalId: "s1",
      sucursal: "Central",
      debe: "100.00",
      haber: "0.00",
      saldoAnterior: "0.00",
      saldo: "100.00",
    },
    {
      fecha: "2026-02-10",
      partidaId: "p2",
      numero: 2,
      tipo: "operacion",
      concepto: "Venta",
      sucursalId: "s1",
      sucursal: "Central",
      debe: "0.00",
      haber: "25.00",
      saldoAnterior: "100.00",
      saldo: "75.00",
    },
    {
      fecha: "2026-03-10",
      partidaId: "p3",
      numero: 3,
      tipo: "ajuste",
      concepto: "Ajuste",
      sucursalId: "s2",
      sucursal: "Norte",
      debe: "10.00",
      haber: "0.00",
      saldoAnterior: "75.00",
      saldo: "85.00",
    },
  ],
};

describe("armarLibroMayor", () => {
  it("devuelve saldo acumulado, saldo inicial y totales en el rango solicitado", () => {
    const mayor = armarLibroMayor(cuenta, { desde: "2026-02-01", hasta: "2026-02-28", tipo: null });
    expect(mayor).toMatchObject({
      saldoInicial: "100.00",
      totalDebe: "0.00",
      totalHaber: "25.00",
      saldoFinal: "75.00",
    });
    expect(mayor.movimientos).toHaveLength(1);
    expect(mayor.movimientos[0]).toMatchObject({ concepto: "Venta", saldo: "75.00" });
  });

  it("filtra el tipo visible y conserva el saldo acumulado con todos los movimientos", () => {
    const mayor = armarLibroMayor(cuenta, { desde: "2026-02-01", hasta: "2026-03-31", tipo: "ajuste" });
    expect(mayor.movimientos.map((m) => m.tipo)).toEqual(["ajuste"]);
    expect(mayor.movimientos[0]?.saldo).toBe("85.00");
    expect(mayor.saldoInicial).toBe("100.00");
    expect(mayor.saldoFinal).toBe("85.00");
  });

  it("devuelve cero cuando la cuenta todavía no tiene movimientos", () => {
    const mayor = armarLibroMayor({ ...cuenta, movimientos: [] }, { desde: null, hasta: null, tipo: null });
    expect(mayor).toMatchObject({
      saldoInicial: "0.00",
      totalDebe: "0.00",
      totalHaber: "0.00",
      saldoFinal: "0.00",
    });
  });
});
