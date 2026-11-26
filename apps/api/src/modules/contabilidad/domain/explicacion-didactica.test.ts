import { describe, expect, it } from "vitest";
import { explicarPartidaDidactica } from "./explicacion-didactica.js";

const lineas = [
  { cuentaId: "caja", codigo: "1101", nombre: "Caja", debe: "25.00", haber: "0.00", concepto: "Cobro" },
  { cuentaId: "ventas", codigo: "4101", nombre: "Ventas", debe: "0.00", haber: "25.00", concepto: null },
  {
    cuentaId: "sin-movimiento",
    codigo: "1102",
    nombre: "Banco",
    debe: "0.00",
    haber: "0.00",
    concepto: null,
  },
];

describe("explicación didáctica de partida", () => {
  it("no genera contenido didáctico para partidas manuales", () => {
    expect(explicarPartidaDidactica("manual", lineas)).toBeNull();
  });

  it("explica la regla, cada línea y arma el esquema T con los importes originales", () => {
    const explicacion = explicarPartidaDidactica("ventas", lineas)!;

    expect(explicacion.regla.codigo).toBe("ventas");
    expect(explicacion.lineas).toHaveLength(3);
    expect(explicacion.lineas[0]?.explicacion).toContain("Se debita Caja por $25.00. Cobro");
    expect(explicacion.lineas[2]?.lado).toBe("sin_movimiento");
    expect(explicacion.esquemaT).toEqual({
      debe: [{ codigo: "1101", nombre: "Caja", monto: "25.00" }],
      haber: [{ codigo: "4101", nombre: "Ventas", monto: "25.00" }],
    });
  });

  it("usa una explicación genérica para orígenes nuevos", () => {
    const explicacion = explicarPartidaDidactica("origen_nuevo", lineas)!;

    expect(explicacion.regla.codigo).toBe("origen_nuevo");
    expect(explicacion.regla.explicacion).toContain("partida doble");
  });
});
