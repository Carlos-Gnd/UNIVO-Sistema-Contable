// Libro diario en el formato de clase (HU-25): renglones de cada partida (S2-T15) y foliado (S2-T16).
import type { ConsultaLibroDiario, RenglonDiario } from "@contable/shared";
import { describe, expect, it } from "vitest";
import {
  armarLibroDiario,
  foliar,
  renglonesDePartida,
  type LineaDiario,
  type PartidaDiario,
} from "./libro-diario.js";

const MAYOR: Record<string, string> = {
  "1101": "Efectivo y Equivalentes de Efectivo",
  "1109": "Inventarios",
  "2109": "IVA Débito Fiscal",
  "5101": "Ventas",
};

const linea = (codigo: string, nombre: string, debe: string, haber: string): LineaDiario => ({
  codigo,
  nombre,
  codigoMayor: codigo.slice(0, 4),
  nombreMayor: MAYOR[codigo.slice(0, 4)]!,
  debe,
  haber,
});

const venta: PartidaDiario = {
  id: "p1",
  fecha: "2026-10-05",
  tipo: "operacion",
  numero: 7,
  estado: "contabilizada",
  concepto: "Venta al contado según factura 15",
  lineas: [
    linea("110101", "Caja General", "500.00", "0"),
    linea("110102", "Caja Chica", "65.00", "0"),
    linea("510101", "Ventas al Contado", "0", "500.00"),
    linea("2109", "IVA Débito Fiscal", "0", "65.00"),
  ],
};

const sinBase = (r: RenglonDiario) => [r.tipo, r.codigo, r.descripcion, r.parcial, r.debe, r.haber];

describe("renglonesDePartida (S2-T15)", () => {
  it("encabezado, cuentas de mayor con el total al debe o al haber, subcuentas en Parcial y concepto", () => {
    expect(renglonesDePartida(venta).map(sinBase)).toEqual([
      ["partida", null, "Partida N.º 7", null, null, null],
      ["cuenta", "1101", "Efectivo y Equivalentes de Efectivo", null, "565.00", null],
      ["subcuenta", "110101", "Caja General", "500.00", null, null],
      ["subcuenta", "110102", "Caja Chica", "65.00", null, null],
      ["cuenta", "5101", "Ventas", null, null, "500.00"],
      ["subcuenta", "510101", "Ventas al Contado", "500.00", null, null],
      // registrada en la propia cuenta de mayor: no lleva subcuenta
      ["cuenta", "2109", "IVA Débito Fiscal", null, null, "65.00"],
      ["concepto", null, "V/ Venta al contado según factura 15", null, null, null],
    ]);
  });

  it("el encabezado lleva la fecha; los demás renglones no", () => {
    const [encabezado, ...resto] = renglonesDePartida(venta);
    expect(encabezado).toMatchObject({ fecha: "2026-10-05", partidaId: "p1" });
    expect(resto.every((r) => r.fecha === null && r.partidaId === "p1")).toBe(true);
  });

  it("primero todo el debe y luego el haber, aunque las líneas vengan mezcladas", () => {
    const mezclada: PartidaDiario = {
      ...venta,
      lineas: [venta.lineas[2]!, venta.lineas[0]!, venta.lineas[3]!, venta.lineas[1]!],
    };
    expect(
      renglonesDePartida(mezclada)
        .filter((r) => r.tipo === "cuenta")
        .map((r) => [r.codigo, r.debe, r.haber]),
    ).toEqual([
      ["1101", "565.00", null],
      ["5101", null, "500.00"],
      ["2109", null, "65.00"],
    ]);
  });

  it("indica el tipo y si está anulada; sin concepto no agrega el renglón V/", () => {
    const ajuste = { ...venta, tipo: "ajuste" as const, estado: "anulada" as const, concepto: null };
    const r = renglonesDePartida(ajuste);
    expect(r[0]!.descripcion).toBe("Partida N.º 7 (ajuste, anulada)");
    expect(r.at(-1)!.tipo).not.toBe("concepto");
  });
});

/** n renglones de cuenta con 1.00 al debe o al haber, alternados. */
const renglones = (n: number): RenglonDiario[] =>
  Array.from({ length: n }, (_, i) => ({
    tipo: "cuenta",
    partidaId: "p",
    fecha: null,
    codigo: "1101",
    descripcion: "Caja",
    parcial: "9.99", // la columna Parcial no se acumula
    debe: i % 2 === 0 ? "1.00" : null,
    haber: i % 2 === 1 ? "1.00" : null,
  }));

describe("foliar (S2-T16)", () => {
  it("divide en páginas con folio correlativo desde el inicial", () => {
    const paginas = foliar(renglones(25), 10, 12);
    expect(paginas.map((p) => [p.folio, p.renglones.length])).toEqual([
      [12, 10],
      [13, 10],
      [14, 5],
    ]);
  });

  it("cada página recibe lo que pasa de la anterior; la primera empieza en cero", () => {
    const paginas = foliar(renglones(25), 10, 1);
    expect(paginas.map((p) => [p.vienen, p.pasan])).toEqual([
      [
        { debe: "0.00", haber: "0.00" },
        { debe: "5.00", haber: "5.00" },
      ],
      [
        { debe: "5.00", haber: "5.00" },
        { debe: "10.00", haber: "10.00" },
      ],
      [
        { debe: "10.00", haber: "10.00" },
        { debe: "13.00", haber: "12.00" },
      ],
    ]);
  });

  it("sin renglones no hay páginas", () => {
    expect(foliar([], 10, 1)).toEqual([]);
  });
});

describe("armarLibroDiario", () => {
  const consulta: ConsultaLibroDiario = {
    desde: "2026-10-01",
    hasta: "2026-10-31",
    renglonesPorPagina: 10,
    folioInicial: 1,
  };

  it("los totales son lo que pasa de la última página y cuadran", () => {
    const libro = armarLibroDiario(consulta, [venta, { ...venta, id: "p2", numero: 8 }]);
    expect(libro).toMatchObject({
      partidas: 2,
      tipo: null,
      sucursalId: null,
      totales: { debe: "1130.00", haber: "1130.00" },
      cuadra: true,
    });
    expect(libro.paginas.map((p) => p.renglones.length)).toEqual([10, 6]);
  });

  it("sin partidas: sin páginas y totales en cero", () => {
    expect(armarLibroDiario(consulta, [])).toMatchObject({
      partidas: 0,
      paginas: [],
      totales: { debe: "0.00", haber: "0.00" },
      cuadra: true,
    });
  });
});
