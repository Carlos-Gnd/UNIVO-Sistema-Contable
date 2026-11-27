import { describe, expect, it } from "vitest";
import {
  calcularProyeccion,
  ProyeccionFueraDeRangoError,
  SinHistorialProyeccionError,
  type MesHistoricoProyeccion,
} from "./proyecciones.js";

function historial(ventas: number[]): MesHistoricoProyeccion[] {
  return ventas.map((venta, indice) => ({
    mes: `${2025 + Math.floor((indice + 10) / 12)}-${String(((indice + 10) % 12) + 1).padStart(2, "0")}`,
    ventas: venta.toFixed(2),
    gastos: (venta * 0.7).toFixed(2),
    flujoEfectivo: (venta * 0.2).toFixed(2),
    iva: (venta * 0.13).toFixed(2),
  }));
}

describe("calcularProyeccion", () => {
  it("usa promedio móvil con historial corto y aplica los supuestos compuestos por mes", () => {
    const resultado = calcularProyeccion(historial([100, 110, 120, 130]), {
      meses: 2,
      crecimientoVentasMensual: 10,
      crecimientoGastosMensual: 0,
    });

    expect(resultado.metodo).toBe("promedio-movil");
    expect(resultado.calculadaConDatosHasta).toBe("2026-02-01");
    expect(resultado.periodos.map((p) => p.mes)).toEqual(["2026-03-01", "2026-04-01"]);
    expect(resultado.periodos[0]?.ventas.estimado).toBe("132.00");
    expect(resultado.periodos[1]?.ventas.estimado).toBe("145.20");
    expect(resultado.periodos[0]?.utilidad.estimado).toBe("48.00");
  });

  it("selecciona regresión con historial mediano y aplica una caída mensual del cien por ciento", () => {
    const resultado = calcularProyeccion(historial([100, 200, 300, 400, 500, 600]), {
      meses: 1,
      crecimientoVentasMensual: -100,
      crecimientoGastosMensual: 0,
    });

    expect(resultado.metodo).toBe("regresion");
    expect(resultado.periodos[0]?.ventas).toEqual({ estimado: "0.00", minimo: "0.00", maximo: "0.00" });
    expect(resultado.periodos[0]?.gastos.estimado).toBe("490.00");
  });

  it("elige Holt-Winters cuando existen dos años de datos mensuales", () => {
    const estacionalidad = [100, 130, 150, 120, 110, 140, 160, 130, 120, 150, 170, 140];
    const resultado = calcularProyeccion(historial([...estacionalidad, ...estacionalidad]), {
      meses: 1,
      crecimientoVentasMensual: 0,
      crecimientoGastosMensual: 0,
    });

    expect(resultado.metodo).toBe("holt-winters");
    expect(resultado.periodos[0]?.ventas.estimado).toBe("100.00");
    expect(Number(resultado.periodos[0]?.ventas.minimo)).toBeLessThanOrEqual(100);
    expect(Number(resultado.periodos[0]?.ventas.maximo)).toBeGreaterThanOrEqual(100);
  });

  it("rechaza historial vacío y supuestos cuyo resultado excede el rango monetario", () => {
    expect(() =>
      calcularProyeccion([], { meses: 1, crecimientoVentasMensual: 0, crecimientoGastosMensual: 0 }),
    ).toThrow(SinHistorialProyeccionError);
    expect(() =>
      calcularProyeccion(historial([999_999_999_999]), {
        meses: 24,
        crecimientoVentasMensual: 1000,
        crecimientoGastosMensual: 0,
      }),
    ).toThrow(ProyeccionFueraDeRangoError);
  });
});
