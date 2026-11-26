import { describe, expect, it } from "vitest";
import { evaluarRetencionPercepcion } from "./retencion-percepcion";

const evaluar = (
  empresa: "grande" | "mediano" | "otro",
  tercero: "grande" | "mediano" | "otro",
  operacion: "compra" | "venta",
  base = "250.00",
) => evaluarRetencionPercepcion({ empresa, tercero, operacion, base });

describe("evaluarRetencionPercepcion", () => {
  it("una venta a un gran contribuyente: nos retienen el 1 % (sufrida)", () => {
    expect(evaluar("otro", "grande", "venta")).toEqual({
      tipo: "retencion",
      sentido: "sufrida",
      monto: "2.50",
      motivo: null,
    });
  });

  it("una compra a un gran contribuyente: nos perciben el 1 % (sufrida)", () => {
    expect(evaluar("otro", "grande", "compra")).toMatchObject({
      tipo: "percepcion",
      sentido: "sufrida",
      monto: "2.50",
    });
  });

  it("si la empresa es gran contribuyente, retiene en las compras y percibe en las ventas (efectuadas)", () => {
    expect(evaluar("grande", "otro", "compra")).toMatchObject({
      tipo: "retencion",
      sentido: "efectuada",
      monto: "2.50",
    });
    expect(evaluar("grande", "mediano", "venta")).toMatchObject({
      tipo: "percepcion",
      sentido: "efectuada",
      monto: "2.50",
    });
  });

  it("no aplica bajo el mínimo de 100.00, pero sí exactamente en 100.00", () => {
    expect(evaluar("otro", "grande", "venta", "99.99")).toMatchObject({
      tipo: "ninguna",
      motivo: "bajo_minimo",
    });
    expect(evaluar("otro", "grande", "venta", "100.00")).toMatchObject({ tipo: "retencion", monto: "1.00" });
  });

  it("no aplica si ninguno o ambos son gran contribuyente", () => {
    expect(evaluar("otro", "mediano", "venta")).toMatchObject({ tipo: "ninguna", motivo: "ninguno_grande" });
    expect(evaluar("grande", "grande", "compra")).toMatchObject({ tipo: "ninguna", motivo: "ambos_grandes" });
  });
});
