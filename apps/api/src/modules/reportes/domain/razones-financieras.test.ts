import { describe, expect, it } from "vitest";
import type { BalanceGeneral, EstadoResultados } from "@contable/shared";
import { calcularRazonesFinancieras } from "./razones-financieras.js";

const estado: EstadoResultados = {
  desde: "2026-01-01",
  hasta: "2026-01-31",
  sucursalId: null,
  ventas: { titulo: "Ventas", renglones: [], total: "2000.00" },
  costoVentas: { titulo: "Costo de ventas", renglones: [], total: "1200.00" },
  utilidadBruta: "800.00",
  gastosOperacion: { titulo: "Gastos de operación", renglones: [], total: "300.00" },
  utilidadOperacion: "500.00",
  otrosIngresos: { titulo: "Otros ingresos", renglones: [], total: "0.00" },
  otrosGastos: { titulo: "Otros gastos", renglones: [], total: "0.00" },
  utilidadAntesImpuesto: "500.00",
  impuestoRenta: { titulo: "Impuesto", renglones: [], total: "50.00" },
  utilidadNeta: "450.00",
};

const balance: BalanceGeneral = {
  fecha: "2026-01-31",
  sucursalId: null,
  activoCorriente: {
    titulo: "Activo corriente",
    total: "1000.00",
    renglones: [
      { codigo: "1101", nombre: "Efectivo", monto: "600.00" },
      { codigo: "1109", nombre: "Inventarios", monto: "300.00" },
      { codigo: "1110", nombre: "Deterioro de inventarios", monto: "-20.00" },
      { codigo: "1103", nombre: "Clientes", monto: "120.00" },
    ],
  },
  activoNoCorriente: { titulo: "Activo no corriente", renglones: [], total: "500.00" },
  totalActivo: "1500.00",
  pasivoCorriente: { titulo: "Pasivo corriente", renglones: [], total: "400.00" },
  pasivoNoCorriente: { titulo: "Pasivo no corriente", renglones: [], total: "100.00" },
  totalPasivo: "500.00",
  patrimonio: { titulo: "Patrimonio", renglones: [], total: "1000.00" },
  totalPasivoPatrimonio: "1500.00",
  diferencia: "0.00",
  cuadra: true,
};

describe("calcularRazonesFinancieras", () => {
  it("calcula liquidez, endeudamiento y rentabilidad incluyendo la prueba ácida neta de inventario", () => {
    expect(calcularRazonesFinancieras(estado, balance)).toEqual({
      desde: "2026-01-01",
      hasta: "2026-01-31",
      sucursalId: null,
      liquidezCorriente: "2.50",
      pruebaAcida: "1.80",
      endeudamiento: "33.33",
      margenBruto: "40.00",
      margenOperativo: "25.00",
      margenNeto: "22.50",
      rentabilidadActivo: "30.00",
      rentabilidadPatrimonio: "45.00",
    });
  });

  it("devuelve null cuando el denominador es cero", () => {
    const sinSaldos = {
      ...balance,
      activoCorriente: { ...balance.activoCorriente, total: "0.00" },
      pasivoCorriente: { ...balance.pasivoCorriente, total: "0.00" },
      totalActivo: "0.00",
      totalPasivo: "0.00",
      patrimonio: { ...balance.patrimonio, total: "0.00" },
    };
    const sinVentas = { ...estado, ventas: { ...estado.ventas, total: "0.00" } };
    const razones = calcularRazonesFinancieras(sinVentas, sinSaldos);

    expect(razones.liquidezCorriente).toBeNull();
    expect(razones.pruebaAcida).toBeNull();
    expect(razones.endeudamiento).toBeNull();
    expect(razones.margenBruto).toBeNull();
    expect(razones.margenOperativo).toBeNull();
    expect(razones.margenNeto).toBeNull();
    expect(razones.rentabilidadActivo).toBeNull();
    expect(razones.rentabilidadPatrimonio).toBeNull();
  });
});
