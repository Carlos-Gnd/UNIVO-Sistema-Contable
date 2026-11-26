import { describe, expect, it } from "vitest";
import { variacionPorcentual } from "./variacion";

describe("variacionPorcentual (HU-43)", () => {
  it("es la diferencia entre la base, en porcentaje con dos decimales", () => {
    expect(variacionPorcentual("150.00", "100.00")).toBe("50.00");
    expect(variacionPorcentual("80.00", "100.00")).toBe("-20.00");
    expect(variacionPorcentual("100.00", "100.00")).toBe("0.00");
    expect(variacionPorcentual("2.00", "3.00")).toBe("-33.33");
    expect(variacionPorcentual("200.00", "3.00")).toBe("6566.67");
  });

  it("sin base no hay porcentaje", () => {
    expect(variacionPorcentual("500.00", "0.00")).toBeNull();
    expect(variacionPorcentual("0.00", "0")).toBeNull();
  });

  it("una base negativa conserva el sentido: mejorar una pérdida es una variación positiva", () => {
    expect(variacionPorcentual("-50.00", "-100.00")).toBe("50.00");
    expect(variacionPorcentual("-150.00", "-100.00")).toBe("-50.00");
    expect(variacionPorcentual("100.00", "-100.00")).toBe("200.00");
  });
});
