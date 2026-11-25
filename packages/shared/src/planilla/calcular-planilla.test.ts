import { describe, expect, it } from "vitest";
import { calcularEmpleadoPlanilla, resumirPlanilla } from "./calcular-planilla";
import { calcularPlanillaSchema, type ConfiguracionPlanillaVista } from "../esquemas/planilla";

const configuracion: ConfiguracionPlanillaVista = {
  id: "8e3c60df-79b2-47f7-b725-59d0b25fd9e8",
  vigenteDesde: "2026-01-01",
  tasaIsssLaboral: "3.00",
  tasaIsssPatronal: "7.50",
  techoIsss: "1000.00",
  tasaAfpLaboral: "7.25",
  tasaAfpPatronal: "8.75",
  tramos: [
    { desde: "0.00", hasta: "550.00", porcentaje: "0.00", cuotaFija: "0.00" },
    { desde: "550.00", hasta: "895.24", porcentaje: "10.00", cuotaFija: "17.67" },
    { desde: "895.24", hasta: "2038.10", porcentaje: "20.00", cuotaFija: "60.00" },
    { desde: "2038.10", hasta: null, porcentaje: "30.00", cuotaFija: "288.57" },
  ],
};

describe("cálculo de planilla", () => {
  it("calcula horas extra, ausencias, descuentos y cuotas al centavo", () => {
    const empleado = calcularEmpleadoPlanilla(
      {
        empleadoId: "77da968e-6a2a-4db7-8e5f-09f9a4a9c705",
        nombres: "Persona",
        apellidos: "Prueba",
        numeroIsss: "ISSS-SINTETICO-01",
        nup: "NUP-SINTETICO-01",
        dui: "DUI-SINTETICO-01",
        puesto: "Auxiliar",
        area: "Administración",
        salario: "1875.61",
      },
      { horasExtra: "3.50", diasAusencia: "0.50", otrosDescuentos: "40.00" },
      configuracion,
    );

    expect(empleado).toMatchObject({
      salarioBase: "1875.61",
      pagoHorasExtra: "54.71",
      descuentoAusencia: "31.26",
      bruto: "1899.06",
      isssLaboral: "30.00",
      afpLaboral: "137.68",
      renta: "227.23",
      isssPatronal: "75.00",
      afpPatronal: "166.17",
      otrosDescuentos: "40.00",
      neto: "1464.15",
    });
    expect(resumirPlanilla([empleado])).toMatchObject({
      bruto: "1899.06",
      neto: "1464.15",
      gastoPatronal: "241.17",
    });
  });

  it("no retiene renta cuando el bruto queda bajo el primer límite", () => {
    const empleado = calcularEmpleadoPlanilla(
      {
        empleadoId: "77da968e-6a2a-4db7-8e5f-09f9a4a9c705",
        nombres: "Persona",
        apellidos: "Prueba",
        numeroIsss: "ISSS-SINTETICO-02",
        nup: "NUP-SINTETICO-02",
        dui: "DUI-SINTETICO-02",
        puesto: "Asistente",
        area: null,
        salario: "420.00",
      },
      { horasExtra: "0.00", diasAusencia: "0.00", otrosDescuentos: "0.00" },
      configuracion,
    );
    expect(empleado.renta).toBe("0.00");
  });

  it("valida período, cantidades y ajustes duplicados", () => {
    const entrada = {
      periodo: "2026-11",
      sucursalId: "562c66b6-86d8-4b0d-991d-f4a61d17c1da",
      cuentasGastoPorArea: [],
      ajustes: [
        {
          empleadoId: "77da968e-6a2a-4db7-8e5f-09f9a4a9c705",
          horasExtra: "2.25",
          diasAusencia: "1.00",
          otrosDescuentos: "8.50",
        },
      ],
    };
    expect(calcularPlanillaSchema.parse(entrada)).toMatchObject({ periodo: "2026-11" });
    expect(calcularPlanillaSchema.safeParse({ ...entrada, periodo: "2026-13" }).success).toBe(false);
    expect(
      calcularPlanillaSchema.safeParse({
        ...entrada,
        ajustes: [{ ...entrada.ajustes[0]!, horasExtra: "301" }],
      }).success,
    ).toBe(false);
    expect(
      calcularPlanillaSchema.safeParse({
        ...entrada,
        ajustes: [entrada.ajustes[0], entrada.ajustes[0]],
      }).success,
    ).toBe(false);
  });

  it("reproduce la planilla de octubre del ejercicio CheroPhonex (HU-72, S3-T102)", () => {
    const sin = { horasExtra: "0", diasAusencia: "0", otrosDescuentos: "0.00" };
    const salarios = ["600.00", "450.00", "450.00", "450.00", "450.00"];
    const filas = salarios.map((salario, i) =>
      calcularEmpleadoPlanilla(
        {
          empleadoId: `00000000-0000-4000-8000-00000000000${i}`,
          nombres: `Persona ${i}`,
          apellidos: "CheroPhonex",
          numeroIsss: `ISSS-${i}`,
          nup: `NUP-${i}`,
          dui: `E${i}`,
          puesto: "P",
          area: null,
          salario,
        },
        sin,
        configuracion,
      ),
    );
    expect(
      filas.map((fila) => ({
        salarioBase: fila.salarioBase,
        isssLaboral: fila.isssLaboral,
        afpLaboral: fila.afpLaboral,
        renta: fila.renta,
        neto: fila.neto,
        isssPatronal: fila.isssPatronal,
        afpPatronal: fila.afpPatronal,
      })),
    ).toEqual([
      {
        salarioBase: "600.00",
        isssLaboral: "18.00",
        afpLaboral: "43.50",
        renta: "0.00",
        neto: "538.50",
        isssPatronal: "45.00",
        afpPatronal: "52.50",
      },
      ...Array.from({ length: 4 }, () => ({
        salarioBase: "450.00",
        isssLaboral: "13.50",
        afpLaboral: "32.63",
        renta: "0.00",
        neto: "403.87",
        isssPatronal: "33.75",
        afpPatronal: "39.38",
      })),
    ]);
    const r = resumirPlanilla(filas);
    expect(r).toEqual({
      bruto: "2400.00",
      isssLaboral: "72.00",
      afpLaboral: "174.02",
      renta: "0.00",
      otrosDescuentos: "0.00",
      neto: "2153.98",
      isssPatronal: "180.00",
      afpPatronal: "210.02",
      gastoPatronal: "390.02",
    });
  });
});
