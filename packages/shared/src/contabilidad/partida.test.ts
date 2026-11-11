import { describe, expect, it } from "vitest";
import { validarPartida, type CuentaInfo, type LineaPartida } from "./partida";

const cuentas = new Map<string, CuentaInfo>([
  ["caja", { id: "caja", codigo: "110101", activa: true, imputable: true }],
  ["ventas", { id: "ventas", codigo: "5101", activa: true, imputable: true }],
  ["iva", { id: "iva", codigo: "210601", activa: true, imputable: true }],
  ["activo", { id: "activo", codigo: "1", activa: true, imputable: false }],
  ["vieja", { id: "vieja", codigo: "110199", activa: false, imputable: true }],
]);

const venta: LineaPartida[] = [
  { cuentaId: "caja", debe: "113.00", haber: "0" },
  { cuentaId: "ventas", debe: "0", haber: "100.00" },
  { cuentaId: "iva", debe: "0", haber: "13.00" },
];

describe("validarPartida", () => {
  it("acepta una partida cuadrada y calcula sus totales", () => {
    const r = validarPartida(venta, cuentas);
    expect(r.cuadra).toBe(true);
    expect(r.puedeContabilizarse).toBe(true);
    expect(r.totalDebe).toBe("113.00");
    expect(r.totalHaber).toBe("113.00");
    expect(r.diferencia).toBe("0.00");
    expect(r.errores).toEqual([]);
  });

  it("detecta la diferencia de una partida descuadrada, que solo puede quedar en borrador", () => {
    const r = validarPartida([...venta.slice(0, 2)], cuentas);
    expect(r.cuadra).toBe(false);
    expect(r.diferencia).toBe("13.00");
    expect(r.puedeContabilizarse).toBe(false);
    expect(r.errores).toEqual([]); // descuadrar no es un error de captura: se guarda como borrador
  });

  it("exige al menos dos líneas y un total mayor que cero para contabilizar", () => {
    expect(validarPartida([], cuentas).puedeContabilizarse).toBe(false);
    expect(validarPartida([{ cuentaId: "caja", debe: "0", haber: "0" }], cuentas).puedeContabilizarse).toBe(
      false,
    );
  });

  it("rechaza líneas con debe y haber a la vez, sin monto o con montos negativos", () => {
    const r = validarPartida(
      [
        { cuentaId: "caja", debe: "10", haber: "10" },
        { cuentaId: "ventas", debe: "0", haber: "0" },
        { cuentaId: "iva", debe: "-5", haber: "0" },
      ],
      cuentas,
    );
    expect(r.errores.map((e) => e.linea)).toEqual([0, 1, 2]);
    expect(r.puedeContabilizarse).toBe(false);
  });

  it("rechaza cuentas que no son de último nivel, inactivas o inexistentes", () => {
    const r = validarPartida(
      [
        { cuentaId: "activo", debe: "10", haber: "0" },
        { cuentaId: "vieja", debe: "0", haber: "5" },
        { cuentaId: "no-existe", debe: "0", haber: "5" },
      ],
      cuentas,
    );
    expect(r.errores.map((e) => e.codigo)).toEqual([
      "CUENTA_NO_IMPUTABLE",
      "CUENTA_INACTIVA",
      "CUENTA_INEXISTENTE",
    ]);
  });

  it("no pierde centavos al sumar muchas líneas", () => {
    const lineas: LineaPartida[] = Array.from({ length: 30 }, () => ({
      cuentaId: "caja",
      debe: "0.10",
      haber: "0",
    }));
    lineas.push({ cuentaId: "ventas", debe: "0", haber: "3.00" });
    expect(validarPartida(lineas, cuentas).cuadra).toBe(true);
  });
});
