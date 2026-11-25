import { describe, expect, it } from "vitest";
import { calcularPrestacionesEmpleado } from "./calcular-prestaciones";

const FECHA_CALCULO = "2026-12-12";
const salarios = ["600.00", "450.00", "450.00", "450.00", "450.00"];
const ingresos = ["2025-12-12", "2026-06-12", "2024-12-12", "2023-12-12", "2016-12-12"];

const cincoPersonas = salarios.map((salario, indice) =>
  calcularPrestacionesEmpleado(
    {
      empleadoId: `00000000-0000-4000-8000-${String(indice + 1).padStart(12, "0")}`,
      dui: `DUI-SINTETICO-${indice + 1}`,
      puesto: `Cargo ${indice + 1}`,
      area: null,
      fechaIngreso: ingresos[indice]!,
      salario,
    },
    FECHA_CALCULO,
  ),
);

describe("cálculo de prestaciones", () => {
  it("calcula las prestaciones de las cinco personas en los cuatro rangos de antigüedad", () => {
    expect(
      cincoPersonas.map((persona) => ({
        salarioBase: persona.salarioBase,
        diasServicio: persona.diasServicio,
        aniosServicio: persona.aniosServicio,
        diasAguinaldo: persona.diasAguinaldo,
        montoAguinaldo: persona.montoAguinaldo,
        provisionAguinaldoMensual: persona.provisionAguinaldoMensual,
        diasPeriodoVacacional: persona.diasPeriodoVacacional,
        montoVacaciones: persona.montoVacaciones,
        provisionVacacionesMensual: persona.provisionVacacionesMensual,
        salarioBaseIndemnizacion: persona.salarioBaseIndemnizacion,
        montoIndemnizacion: persona.montoIndemnizacion,
        provisionIndemnizacionMensual: persona.provisionIndemnizacionMensual,
      })),
    ).toEqual([
      {
        salarioBase: "600.00",
        diasServicio: 365,
        aniosServicio: "1.0000",
        diasAguinaldo: "15.00",
        montoAguinaldo: "300.00",
        provisionAguinaldoMensual: "25.00",
        diasPeriodoVacacional: 365,
        montoVacaciones: "390.00",
        provisionVacacionesMensual: "32.50",
        salarioBaseIndemnizacion: "600.00",
        montoIndemnizacion: "600.00",
        provisionIndemnizacionMensual: "50.00",
      },
      {
        salarioBase: "450.00",
        diasServicio: 183,
        aniosServicio: "0.5014",
        diasAguinaldo: "15.00",
        montoAguinaldo: "112.81",
        provisionAguinaldoMensual: "18.75",
        diasPeriodoVacacional: 0,
        montoVacaciones: "0.00",
        provisionVacacionesMensual: "0.00",
        salarioBaseIndemnizacion: "450.00",
        montoIndemnizacion: "225.62",
        provisionIndemnizacionMensual: "37.50",
      },
      {
        salarioBase: "450.00",
        diasServicio: 730,
        aniosServicio: "2.0000",
        diasAguinaldo: "15.00",
        montoAguinaldo: "225.00",
        provisionAguinaldoMensual: "18.75",
        diasPeriodoVacacional: 365,
        montoVacaciones: "292.50",
        provisionVacacionesMensual: "24.38",
        salarioBaseIndemnizacion: "450.00",
        montoIndemnizacion: "900.00",
        provisionIndemnizacionMensual: "37.50",
      },
      {
        salarioBase: "450.00",
        diasServicio: 1096,
        aniosServicio: "3.0027",
        diasAguinaldo: "19.00",
        montoAguinaldo: "285.00",
        provisionAguinaldoMensual: "23.75",
        diasPeriodoVacacional: 1,
        montoVacaciones: "0.80",
        provisionVacacionesMensual: "24.38",
        salarioBaseIndemnizacion: "450.00",
        montoIndemnizacion: "1351.23",
        provisionIndemnizacionMensual: "37.50",
      },
      {
        salarioBase: "450.00",
        diasServicio: 3652,
        aniosServicio: "10.0055",
        diasAguinaldo: "21.00",
        montoAguinaldo: "315.00",
        provisionAguinaldoMensual: "26.25",
        diasPeriodoVacacional: 2,
        montoVacaciones: "1.60",
        provisionVacacionesMensual: "24.38",
        salarioBaseIndemnizacion: "450.00",
        montoIndemnizacion: "4502.47",
        provisionIndemnizacionMensual: "37.50",
      },
    ]);
  });

  it("aplica el corte del 12 de diciembre aunque se calcule después", () => {
    const resultado = calcularPrestacionesEmpleado(
      {
        empleadoId: "00000000-0000-4000-8000-000000000006",
        dui: "DUI-SINTETICO-06",
        puesto: "Cargo de prueba",
        area: null,
        fechaIngreso: "2026-06-12",
        salario: "450.00",
      },
      "2026-12-20",
    );
    expect(resultado.fechaCorteAguinaldo).toBe("2026-12-12");
    expect(resultado.montoAguinaldo).toBe("112.81");
  });

  it("limita el salario indemnizable a dos salarios mínimos configurables", () => {
    const resultado = calcularPrestacionesEmpleado(
      {
        empleadoId: "00000000-0000-4000-8000-000000000007",
        dui: "DUI-SINTETICO-07",
        puesto: "Cargo de prueba",
        area: null,
        fechaIngreso: "2024-01-01",
        salario: "1000.00",
      },
      "2026-01-01",
    );
    expect(resultado.salarioBaseIndemnizacion).toBe("817.60");
    expect(resultado.montoIndemnizacion).toBe("1637.44");
    expect(resultado.provisionIndemnizacionMensual).toBe("68.13");

    const salarioMinimoConfigurado = calcularPrestacionesEmpleado(
      {
        empleadoId: "00000000-0000-4000-8000-000000000008",
        dui: "DUI-SINTETICO-08",
        puesto: "Cargo de prueba",
        area: null,
        fechaIngreso: "2025-01-01",
        salario: "1500.00",
      },
      "2026-01-01",
      { salarioMinimoMensual: "500.00" },
    );
    expect(salarioMinimoConfigurado.salarioBaseIndemnizacion).toBe("1000.00");
  });

  it("redondea los medios centavos hacia arriba", () => {
    const resultado = calcularPrestacionesEmpleado(
      {
        empleadoId: "00000000-0000-4000-8000-000000000009",
        dui: "DUI-SINTETICO-09",
        puesto: "Cargo de prueba",
        area: null,
        fechaIngreso: "2026-01-01",
        salario: "0.01",
      },
      "2026-01-02",
      { diasPorAnioServicio: 2 },
    );
    expect(resultado.montoIndemnizacion).toBe("0.01");
  });
});
