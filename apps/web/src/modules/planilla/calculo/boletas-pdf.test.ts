import { describe, expect, it } from "vitest";
import { htmlBoletasPlanilla } from "./boletas-pdf";

const resultado = {
  periodo: "2026-11",
  sucursalId: "11111111-1111-4111-8111-111111111111",
  empleados: [
    {
      empleadoId: "22222222-2222-4222-8222-222222222222",
      nombres: "Carlos",
      apellidos: "García",
      numeroIsss: "ISSS-001",
      nup: "NUP-001",
      dui: "DUI <01>",
      puesto: "Auxiliar & contador",
      area: "Administración",
      salarioBase: "600.00",
      horasExtra: "0.00",
      pagoHorasExtra: "0.00",
      diasAusencia: "0.00",
      descuentoAusencia: "0.00",
      otrosDescuentos: "0.00",
      bruto: "600.00",
      isssLaboral: "18.00",
      afpLaboral: "43.50",
      renta: "0.00",
      isssPatronal: "45.00",
      afpPatronal: "52.50",
      neto: "538.50",
    },
  ],
  resumen: {
    bruto: "600.00",
    isssLaboral: "18.00",
    afpLaboral: "43.50",
    renta: "0.00",
    otrosDescuentos: "0.00",
    neto: "538.50",
    isssPatronal: "45.00",
    afpPatronal: "52.50",
    gastoPatronal: "97.50",
  },
  partida: {
    id: "33333333-3333-4333-8333-333333333333",
    fecha: "2026-11-30",
    estado: "borrador" as const,
    origen: "planilla",
    concepto: "Planilla del período 2026-11",
    totalDebe: "697.50",
    totalHaber: "697.50",
    cuadra: true,
  },
};

describe("boletas PDF de planilla", () => {
  it("incluye ingresos, descuentos y líquido a pagar con texto escapado", () => {
    const html = htmlBoletasPlanilla(resultado, "Sucursal <Centro>");
    expect(html).toContain("Período 2026-11");
    expect(html).toContain("Carlos García");
    expect(html).toContain("Auxiliar &amp; contador");
    expect(html).toContain("DUI: DUI &lt;01&gt;");
    expect(html).toContain("US$ 600.00");
    expect(html).toContain("US$ 18.00");
    expect(html).toContain("US$ 43.50");
    expect(html).toContain("US$ 538.50");
    expect(html).not.toContain("Sucursal <Centro>");
  });

  it("filtra una boleta por empleado y permite imprimir el lote", () => {
    expect(htmlBoletasPlanilla(resultado, "Sucursal", resultado.empleados[0]!.empleadoId)).toContain(
      "DUI: DUI &lt;01&gt;",
    );
    expect(htmlBoletasPlanilla({ ...resultado, empleados: [] }, "Sucursal")).not.toContain("<section");
    const boleta = htmlBoletasPlanilla(resultado, "Sucursal", resultado.empleados[0]!.empleadoId);
    expect(boleta).toContain("Carlos García");
    expect(boleta).toContain("Auxiliar &amp; contador");
  });
});
