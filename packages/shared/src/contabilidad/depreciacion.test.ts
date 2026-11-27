import { describe, expect, it } from "vitest";
import { cuadroDepreciacion, sumarMeses, tasaAnual, vidaMinimaAnios } from "./depreciacion";

describe("cuadro de depreciación en línea recta", () => {
  it("CheroPhonex: US$ 2,500 a 2 años (50 %) deprecia US$ 104.17 al mes y queda en cero", () => {
    const filas = cuadroDepreciacion({
      costo: "2500.00",
      valorResidual: "0",
      vidaUtilAnios: 2,
      fechaAdquisicion: "2026-10-01",
    });
    expect(filas).toHaveLength(24);
    expect(filas[0]).toEqual({
      mes: "2026-10-01",
      cuota: "104.17",
      acumulada: "104.17",
      valorEnLibros: "2395.83",
    });
    expect(filas[1]?.mes).toBe("2026-11-01");
    // el último mes absorbe el redondeo: 2,500 - 23 × 104.17 = 104.09
    expect(filas[23]).toEqual({
      mes: "2028-09-01",
      cuota: "104.09",
      acumulada: "2500.00",
      valorEnLibros: "0.00",
    });
  });

  it("el valor residual no se deprecia", () => {
    const filas = cuadroDepreciacion({
      costo: "1200",
      valorResidual: "200",
      vidaUtilAnios: 5,
      fechaAdquisicion: "2026-03-15",
    });
    expect(filas[0]?.mes).toBe("2026-03-01");
    expect(filas[0]?.cuota).toBe("16.67");
    expect(filas.at(-1)?.acumulada).toBe("1000.00");
    expect(filas.at(-1)?.valorEnLibros).toBe("200.00");
  });
});

describe("porcentajes fiscales", () => {
  it("la vida mínima sale del porcentaje máximo de la categoría", () => {
    expect(vidaMinimaAnios("mobiliario_equipo")).toBe(2);
    expect(vidaMinimaAnios("equipo_transporte")).toBe(4);
    expect(vidaMinimaAnios("instalaciones")).toBe(5);
    expect(vidaMinimaAnios("edificaciones")).toBe(20);
    expect(tasaAnual(2)).toBe("50.00");
    expect(tasaAnual(3)).toBe("33.33");
  });

  it("suma meses cruzando el año", () => {
    expect(sumarMeses("2026-11-01", 2)).toBe("2027-01-01");
    expect(sumarMeses("2026-12-01", 12)).toBe("2027-12-01");
  });
});
