import { describe, expect, it } from "vitest";
import { armarBalanza, type FilaSaldos } from "./balanza.js";
import { armarHojaTrabajo } from "./hoja-trabajo.js";

const periodo = { desde: "2026-01-01", hasta: "2026-12-31", sucursalId: null };

function fila(
  codigo: string,
  tipo: FilaSaldos["tipo"],
  saldoInicial: string,
  movimientoDebe: string,
  movimientoHaber: string,
): FilaSaldos {
  return {
    cuentaId: `id-${codigo}`,
    codigo,
    nombre: `Cuenta ${codigo}`,
    naturaleza: tipo === "ingresos" || tipo === "pasivo" ? "acreedora" : "deudora",
    tipo,
    saldoInicial,
    movimientoDebe,
    movimientoHaber,
  };
}

function hoja(antes: FilaSaldos[], ajustada: FilaSaldos[]) {
  return armarHojaTrabajo(
    periodo,
    armarBalanza("antes-ajustes", periodo, antes),
    armarBalanza("ajustada", periodo, ajustada),
  );
}

describe("armarHojaTrabajo", () => {
  it("calcula las diez columnas y registra la utilidad para cuadrar resultados y balance", () => {
    const resultado = hoja(
      [
        fila("1101", "activo", "0", "700", "0"),
        fila("2101", "pasivo", "0", "0", "0"),
        fila("4101", "costos_gastos", "0", "300", "0"),
        fila("5101", "ingresos", "0", "0", "1000"),
      ],
      [
        fila("1101", "activo", "0", "700", "0"),
        fila("2101", "pasivo", "0", "0", "50"),
        fila("4101", "costos_gastos", "0", "350", "0"),
        fila("5101", "ingresos", "0", "0", "1000"),
      ],
    );

    expect(resultado.resultado).toEqual({ tipo: "utilidad", monto: "650.00" });
    expect(resultado.lineas.find((linea) => linea.codigo === "4101")).toMatchObject({
      balanzaDebe: "300.00",
      ajustesDebe: "50.00",
      balanzaAjustadaDebe: "350.00",
      estadoResultadosDebe: "350.00",
    });
    expect(resultado.lineas.find((linea) => linea.resultado)).toMatchObject({
      nombre: "Utilidad del ejercicio",
      estadoResultadosDebe: "650.00",
      balanceGeneralHaber: "650.00",
    });
    expect(resultado.totales).toMatchObject({
      balanzaDebe: "1000.00",
      balanzaHaber: "1000.00",
      ajustesDebe: "50.00",
      ajustesHaber: "50.00",
      balanzaAjustadaDebe: "1050.00",
      balanzaAjustadaHaber: "1050.00",
      estadoResultadosDebe: "1000.00",
      estadoResultadosHaber: "1000.00",
      balanceGeneralDebe: "700.00",
      balanceGeneralHaber: "700.00",
    });
    expect(resultado.cuadra).toBe(true);
  });

  it("cuadra una pérdida al lado contrario y mantiene precisión a centavos", () => {
    const resultado = hoja(
      [
        fila("1101", "activo", "0", "600", "0"),
        fila("2101", "pasivo", "0", "0", "800"),
        fila("4101", "costos_gastos", "0", "700", "0"),
        fila("5101", "ingresos", "0", "0", "500"),
      ],
      [
        fila("1101", "activo", "0", "600", "0"),
        fila("2101", "pasivo", "0", "0", "800.20"),
        fila("4101", "costos_gastos", "0", "700.20", "0"),
        fila("5101", "ingresos", "0", "0", "500.00"),
      ],
    );

    expect(resultado.resultado).toEqual({ tipo: "perdida", monto: "200.20" });
    expect(resultado.lineas.find((linea) => linea.resultado)).toMatchObject({
      nombre: "Pérdida del ejercicio",
      estadoResultadosHaber: "200.20",
      balanceGeneralDebe: "200.20",
    });
    expect(resultado.cuadra).toBe(true);
  });

  it("no agrega un renglón de resultado cuando ingresos y gastos son iguales", () => {
    const resultado = hoja(
      [fila("4101", "costos_gastos", "0", "500", "0"), fila("5101", "ingresos", "0", "0", "500")],
      [fila("4101", "costos_gastos", "0", "500", "0"), fila("5101", "ingresos", "0", "0", "500")],
    );

    expect(resultado.resultado).toEqual({ tipo: null, monto: "0.00" });
    expect(resultado.lineas.some((linea) => linea.resultado !== null)).toBe(false);
    expect(resultado.cuadra).toBe(true);
  });

  it("usa saldos finales para ajustes acumulados antes del rango e identifica cuentas liquidadoras y de orden", () => {
    const resultado = hoja(
      [
        fila("1101", "activo", "600", "0", "0"),
        fila("6101", "liquidadora", "-10", "0", "0"),
        fila("9901", "orden", "0", "25", "0"),
        fila("9902", "orden", "0", "0", "25"),
        fila("5101", "ingresos", "-590", "0", "0"),
      ],
      [
        fila("1101", "activo", "650", "0", "0"),
        fila("6101", "liquidadora", "-10", "0", "0"),
        fila("9901", "orden", "0", "25", "0"),
        fila("9902", "orden", "0", "0", "25"),
        fila("5101", "ingresos", "-640", "0", "0"),
      ],
    );

    expect(resultado.lineas.find((linea) => linea.codigo === "1101")).toMatchObject({
      balanzaDebe: "600.00",
      ajustesDebe: "50.00",
      balanzaAjustadaDebe: "650.00",
      balanceGeneralDebe: "650.00",
    });
    expect(resultado.lineas.find((linea) => linea.codigo === "9901")).toMatchObject({
      balanceGeneralDebe: "0.00",
      balanceGeneralHaber: "0.00",
    });
    expect(resultado.lineas.find((linea) => linea.codigo === "6101")).toMatchObject({
      estadoResultadosDebe: "0.00",
      estadoResultadosHaber: "10.00",
      balanceGeneralDebe: "0.00",
      balanceGeneralHaber: "0.00",
    });
    expect(resultado.cuadra).toBe(true);
  });
});
