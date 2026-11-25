import { describe, expect, it } from "vitest";
import { ETIQUETA_FORMATO, NOMBRES_ESTADOS, sinSigno } from "./formato-estados";
import { formatoEstadosSchema } from "./enums";

describe("nombres de los estados por formato (HU-42, S3-T27)", () => {
  it("define todos los nombres en cada formato, sin textos vacíos", () => {
    for (const formato of formatoEstadosSchema.options) {
      const n = NOMBRES_ESTADOS[formato];
      for (const grupo of [n.resultados, n.balance, n.patrimonio]) {
        for (const [clave, nombre] of Object.entries(grupo)) {
          expect(nombre.trim(), `${formato}.${clave}`).not.toBe("");
        }
      }
      expect(ETIQUETA_FORMATO[formato]).not.toBe("");
    }
  });

  it("los dos formatos nombran distinto los estados que cambian de nombre", () => {
    const { clase, niif_pymes: niif } = NOMBRES_ESTADOS;
    expect(clase.resultados.titulo).toBe("Estado de resultados");
    expect(niif.resultados.titulo).toBe("Estado del resultado integral");
    expect(clase.balance.titulo).toBe("Balance general");
    expect(niif.balance.titulo).toBe("Estado de situación financiera");
    expect(niif.patrimonio.titulo).toBe(clase.patrimonio.titulo);
  });

  it("sinSigno quita el rótulo (−) o (+) del renglón", () => {
    expect(sinSigno("(−) Costo de ventas")).toBe("Costo de ventas");
    expect(sinSigno("(+) Otros ingresos")).toBe("Otros ingresos");
    expect(sinSigno("Ventas")).toBe("Ventas");
  });
});
