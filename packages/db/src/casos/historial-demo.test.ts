import { describe, expect, it } from "vitest";
import { generarHistorialDemo } from "./cherophonex.ts";

describe("generarHistorialDemo", () => {
  it("genera 23 meses anteriores al caso de octubre de 2026 con partidas balanceadas", () => {
    const partidas = generarHistorialDemo();
    const meses = new Set(partidas.map((partida) => partida.fecha.slice(0, 7)));

    expect(meses.size).toBe(23);
    expect(meses.has("2024-11")).toBe(true);
    expect(meses.has("2026-09")).toBe(true);
    expect(meses.has("2026-10")).toBe(false);
    expect(partidas).toHaveLength(94);
    for (const partida of partidas) {
      const debe = partida.lineas.reduce((total, linea) => total + Number(linea.debe), 0);
      const haber = partida.lineas.reduce((total, linea) => total + Number(linea.haber), 0);
      expect(debe).toBe(haber);
    }
  });

  it("produce siempre los mismos importes y conceptos", () => {
    expect(generarHistorialDemo()).toEqual(generarHistorialDemo());
  });

  it("compra el mismo costo que reconoce en ventas para no acumular inventario", () => {
    const partidas = generarHistorialDemo();
    for (const compra of partidas.filter((partida) => partida.concepto.startsWith("Compra de inventario"))) {
      const periodo = compra.concepto.slice("Compra de inventario ".length);
      const costo = partidas.find((partida) => partida.concepto === `Costo de ventas ${periodo}`);
      expect(compra.lineas[0]?.debe).toBe(costo?.lineas[0]?.debe);
    }
  });
});
