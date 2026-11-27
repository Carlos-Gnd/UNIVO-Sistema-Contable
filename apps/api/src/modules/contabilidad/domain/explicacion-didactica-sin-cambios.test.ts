// S4-T39 (HU-89): la explicación didáctica solo describe la partida; no cambia ni recalcula ningún importe.
import { Dinero, type LineaPartidaVista } from "@contable/shared";
import { describe, expect, it } from "vitest";
import { explicarPartidaDidactica } from "./explicacion-didactica.js";

/** Venta al contado de CheroPhonex con IVA y su costo, con importes que no se redondean bien en coma flotante. */
const LINEAS: LineaPartidaVista[] = [
  {
    cuentaId: "caja",
    codigo: "110101",
    nombre: "Caja general",
    debe: "1130.10",
    haber: "0.00",
    concepto: "Cobro",
  },
  { cuentaId: "ventas", codigo: "5101", nombre: "Ventas", debe: "0.00", haber: "1000.09", concepto: null },
  {
    cuentaId: "iva",
    codigo: "210601",
    nombre: "IVA débito fiscal",
    debe: "0.00",
    haber: "130.01",
    concepto: null,
  },
  {
    cuentaId: "costo",
    codigo: "4101",
    nombre: "Costo de venta",
    debe: "0.30",
    haber: "0.00",
    concepto: "  ",
  },
  {
    cuentaId: "inventario",
    codigo: "1105",
    nombre: "Inventarios",
    debe: "0.00",
    haber: "0.30",
    concepto: null,
  },
];

/** Congela las líneas y cada objeto: si la explicación intentara escribirlas, la prueba fallaría. */
const congeladas = (lineas: LineaPartidaVista[]) =>
  Object.freeze(lineas.map((l) => Object.freeze({ ...l }))) as readonly LineaPartidaVista[];

const suma = (montos: string[]) => montos.reduce((t, m) => t.mas(Dinero.de(m)), Dinero.de("0")).aTexto();

describe("el modo didáctico no cambia ningún dato (S4-T39)", () => {
  it("no modifica las líneas de la partida que explica", () => {
    const antes = structuredClone(LINEAS);
    const lineas = congeladas(LINEAS);
    expect(() => explicarPartidaDidactica("ventas", lineas)).not.toThrow();
    expect(lineas).toEqual(antes);
  });

  it("el esquema T lleva exactamente los mismos importes, con el mismo texto, en el mismo orden", () => {
    const { esquemaT } = explicarPartidaDidactica("ventas", congeladas(LINEAS))!;
    expect(esquemaT.debe).toEqual([
      { codigo: "110101", nombre: "Caja general", monto: "1130.10" },
      { codigo: "4101", nombre: "Costo de venta", monto: "0.30" },
    ]);
    expect(esquemaT.haber).toEqual([
      { codigo: "5101", nombre: "Ventas", monto: "1000.09" },
      { codigo: "210601", nombre: "IVA débito fiscal", monto: "130.01" },
      { codigo: "1105", nombre: "Inventarios", monto: "0.30" },
    ]);
  });

  it("los totales del esquema T son los de la partida: no aparece ni desaparece un centavo", () => {
    const { esquemaT } = explicarPartidaDidactica("ventas", congeladas(LINEAS))!;
    const debe = suma(esquemaT.debe.map((m) => m.monto));
    const haber = suma(esquemaT.haber.map((m) => m.monto));
    expect(debe).toBe(suma(LINEAS.map((l) => l.debe)));
    expect(haber).toBe(suma(LINEAS.map((l) => l.haber)));
    expect(debe).toBe("1130.40");
    expect(haber).toBe(debe);
  });

  it("explica una línea por cada línea de la partida, con su misma cuenta y su lado", () => {
    const { lineas } = explicarPartidaDidactica("ventas", congeladas(LINEAS))!;
    expect(lineas.map((l) => [l.cuentaId, l.lado])).toEqual([
      ["caja", "debe"],
      ["ventas", "haber"],
      ["iva", "haber"],
      ["costo", "debe"],
      ["inventario", "haber"],
    ]);
    expect(lineas[0]!.explicacion).toContain("US$ 1,130.10");
    expect(lineas[2]!.explicacion).toContain("US$ 130.01");
  });

  it("explicar dos veces la misma partida da lo mismo", () => {
    const lineas = congeladas(LINEAS);
    expect(explicarPartidaDidactica("ventas", lineas)).toEqual(explicarPartidaDidactica("ventas", lineas));
  });

  it("cada origen automático conserva los importes; la partida manual no lleva explicación", () => {
    const lineas = congeladas(LINEAS);
    for (const origen of [
      "compras",
      "ventas",
      "notas",
      "planilla",
      "depreciacion",
      "cierre_anual",
      "otro_modulo",
    ]) {
      const e = explicarPartidaDidactica(origen, lineas)!;
      expect(e.regla.codigo).toBe(origen);
      expect([...e.esquemaT.debe, ...e.esquemaT.haber].map((m) => m.monto).sort()).toEqual(
        ["1130.10", "1000.09", "130.01", "0.30", "0.30"].sort(),
      );
    }
    expect(explicarPartidaDidactica("manual", lineas)).toBeNull();
  });

  it("una línea en cero no se inventa en el esquema T", () => {
    const conCero = congeladas([
      ...LINEAS,
      { cuentaId: "banco", codigo: "110201", nombre: "Bancos", debe: "0.00", haber: "0.00", concepto: null },
    ]);
    const e = explicarPartidaDidactica("ventas", conCero)!;
    expect(e.lineas.at(-1)).toMatchObject({ cuentaId: "banco", lado: "sin_movimiento" });
    expect([...e.esquemaT.debe, ...e.esquemaT.haber].some((m) => m.codigo === "110201")).toBe(false);
  });
});
