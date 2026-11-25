import { describe, expect, it } from "vitest";
import { calcularIsrAnual } from "./isr-anual";
import { crearConfiguracionIsrSchema } from "../esquemas/isr-anual";

const TRAMOS = [
  { desde: "0.00", hasta: "6600.00", porcentaje: "0.00", cuotaFija: "0.00" },
  { desde: "6600.00", hasta: "10742.86", porcentaje: "10.00", cuotaFija: "212.12" },
  { desde: "10742.86", hasta: "24457.14", porcentaje: "20.00", cuotaFija: "720.00" },
  { desde: "24457.14", hasta: null, porcentaje: "30.00", cuotaFija: "3462.86" },
];

describe("cálculo anual del ISR", () => {
  it("aplica el tramo natural marginal y redondea al centavo", () => {
    const calculo = calcularIsrAnual({
      tipoContribuyente: "persona_natural",
      utilidadAntesImpuesto: "7594.99",
      pagosACuenta: "805.90",
      tramos: TRAMOS,
    });

    expect(calculo).toMatchObject({
      utilidadAntesImpuesto: "7594.99",
      baseImponible: "7594.99",
      impuestoDeterminado: "311.62",
      pagosACuenta: "805.90",
      pagosAplicados: "311.62",
      impuestoPendiente: "0.00",
      saldoAFavor: "494.28",
      utilidadDespuesDeImpuesto: "7283.37",
      reservaLegalAProvisionar: "0.00",
    });
    expect(calculo.tramoAplicado).toEqual(TRAMOS[1]);
  });

  it("aplica la tasa configurable de sociedad y limita la reserva al saldo de capital", () => {
    const calculo = calcularIsrAnual({
      tipoContribuyente: "sociedad",
      utilidadAntesImpuesto: "1000.00",
      pagosACuenta: "200.00",
      tasaSociedad: "25.00",
      capitalSocial: "1000.00",
      reservaLegalActual: "180.00",
    });

    expect(calculo).toMatchObject({
      baseImponible: "1000.00",
      impuestoDeterminado: "250.00",
      pagosAplicados: "200.00",
      impuestoPendiente: "50.00",
      utilidadDespuesDeImpuesto: "750.00",
      limiteReservaLegal: "200.00",
      reservaLegalDisponible: "20.00",
      reservaLegalAProvisionar: "20.00",
      tasaAplicada: "25.00",
      tramoAplicado: null,
    });
  });

  it("no calcula ISR sobre pérdida ni genera saldo a favor por encima del pago acreditable", () => {
    const calculo = calcularIsrAnual({
      tipoContribuyente: "sociedad",
      utilidadAntesImpuesto: "-100.00",
      pagosACuenta: "20.00",
      tasaSociedad: "30.00",
      capitalSocial: "1000.00",
      reservaLegalActual: "0.00",
    });

    expect(calculo).toMatchObject({
      baseImponible: "0.00",
      impuestoDeterminado: "0.00",
      pagosAplicados: "0.00",
      saldoAFavor: "20.00",
      reservaLegalAProvisionar: "0.00",
    });
  });

  it("valida que la tabla progresiva empiece en cero, sea continua y termine abierta", () => {
    const base = { anio: 2026, tipoContribuyente: "persona_natural" as const, tramos: TRAMOS };
    expect(crearConfiguracionIsrSchema.safeParse(base).success).toBe(true);
    expect(
      crearConfiguracionIsrSchema.safeParse({
        ...base,
        tramos: [TRAMOS[0], { ...TRAMOS[1]!, desde: "6600.01" }, TRAMOS[2], TRAMOS[3]],
      }).success,
    ).toBe(false);
    expect(
      crearConfiguracionIsrSchema.safeParse({
        ...base,
        tramos: [TRAMOS[0], { ...TRAMOS[1]!, hasta: "10742.86" }],
      }).success,
    ).toBe(false);
  });

  it("exige escribir explícitamente tasas y cuotas, sin convertir campos vacíos a cero", () => {
    expect(
      crearConfiguracionIsrSchema.safeParse({
        anio: 2026,
        tipoContribuyente: "persona_natural",
        tramos: [{ desde: "0.00", hasta: null, porcentaje: "", cuotaFija: "0.00" }],
      }).success,
    ).toBe(false);
    expect(
      crearConfiguracionIsrSchema.safeParse({ anio: 2026, tipoContribuyente: "sociedad", tasaSociedad: "" })
        .success,
    ).toBe(false);
  });
});
