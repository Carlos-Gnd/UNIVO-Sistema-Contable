// Armado del estado comparativo (HU-43, S3-T28 y S3-T30): la variación es la diferencia exacta entre períodos.
import type { Naturaleza, TipoCuenta } from "@contable/shared";
import { Dinero } from "@contable/shared";
import { describe, expect, it } from "vitest";
import type { FilaSaldos } from "./balanza.js";
import { compararBalances, compararResultados } from "./comparativo.js";
import { armarBalanceGeneral, armarEstadoResultados } from "./estados.js";

const NOMBRES = new Map([
  ["1101", "Efectivo"],
  ["1109", "Inventarios"],
  ["2102", "Proveedores"],
  ["3101", "Capital"],
  ["4104", "Costo de Ventas"],
  ["4201", "Gastos de Administración"],
  ["4202", "Gastos de Venta"],
  ["5101", "Ventas"],
  ["5201", "Ingresos Financieros"],
]);

const TIPO: Record<string, TipoCuenta> = {
  "1": "activo",
  "2": "pasivo",
  "3": "patrimonio",
  "4": "costos_gastos",
  "5": "ingresos",
};

function fila(codigo: string, debe: string, haber: string, saldoInicial = "0"): FilaSaldos {
  const tipo = TIPO[codigo[0]!]!;
  const naturaleza: Naturaleza = tipo === "activo" || tipo === "costos_gastos" ? "deudora" : "acreedora";
  return {
    cuentaId: codigo,
    codigo,
    nombre: codigo,
    naturaleza,
    tipo,
    saldoInicial,
    movimientoDebe: debe,
    movimientoHaber: haber,
  };
}

const periodo = (desde: string, hasta: string) => ({ desde, hasta, sucursalId: null });
const er = (filas: FilaSaldos[], p = periodo("2026-10-01", "2026-10-31")) =>
  armarEstadoResultados(p, filas, NOMBRES);

describe("compararResultados", () => {
  const octubre = er([
    fila("510101", "0", "1000.10"),
    fila("4104", "400.20", "0"),
    fila("420101", "100.30", "0"),
  ]);
  const septiembre = er(
    [fila("510101", "0", "800.00"), fila("4104", "300.00", "0"), fila("420201", "50.00", "0")],
    periodo("2026-09-01", "2026-09-30"),
  );
  const c = compararResultados(octubre, septiembre);
  const por = (id: string) => c.filas.find((f) => f.id === id)!;

  it("la variación de cada fila es exactamente el período A menos el período B", () => {
    for (const f of c.filas.filter((f) => f.tipo !== "seccion")) {
      expect(f.variacion, f.id).toBe(Dinero.de(f.periodoA!).menos(f.periodoB!).aTexto());
    }
    expect(por("ventas:5101")).toMatchObject({
      periodoA: "1000.10",
      periodoB: "800.00",
      variacion: "200.10",
    });
    expect(por("utilidadNeta")).toMatchObject({ periodoA: "499.60", periodoB: "450.00", variacion: "49.60" });
  });

  it("el porcentaje se calcula sobre el período B con dos decimales", () => {
    expect(por("ventas:5101").porcentaje).toBe("25.01");
    expect(por("utilidadNeta").porcentaje).toBe("11.02");
    expect(por("costoVentas:4104").porcentaje).toBe("33.40");
  });

  it("una cuenta que solo existe en un período sale con cero en el otro, sin mover el orden", () => {
    expect(por("gastosOperacion:4201")).toMatchObject({
      periodoA: "100.30",
      periodoB: "0.00",
      variacion: "100.30",
      porcentaje: null,
    });
    expect(por("gastosOperacion:4202")).toMatchObject({
      periodoA: "0.00",
      periodoB: "50.00",
      variacion: "-50.00",
      porcentaje: "-100.00",
    });
    const ids = c.filas.filter((f) => f.id.startsWith("gastosOperacion")).map((f) => f.id);
    expect(ids).toEqual([
      "gastosOperacion",
      "gastosOperacion:4201",
      "gastosOperacion:4202",
      "gastosOperacion:total",
    ]);
  });

  it("las secciones opcionales sin movimiento en ninguno de los dos períodos no aparecen", () => {
    const ids = c.filas.map((f) => f.id);
    expect(ids).not.toContain("otrosIngresos");
    expect(ids).not.toContain("impuestoRenta:total");
    expect(ids).toContain("utilidadNeta");
  });

  it("una sección opcional con movimiento solo en uno de los períodos sí aparece", () => {
    const con = compararResultados(er([fila("5201", "0", "30.00")]), er([]));
    expect(con.filas.find((f) => f.id === "otrosIngresos:total")).toMatchObject({
      periodoA: "30.00",
      periodoB: "0.00",
    });
  });

  it("sin base no hay porcentaje: un período B vacío da n/a en todo", () => {
    const vs = compararResultados(octubre, er([]));
    for (const f of vs.filas.filter((f) => f.tipo !== "seccion")) expect(f.porcentaje).toBeNull();
    expect(vs.filas.find((f) => f.id === "utilidadNeta")?.variacion).toBe("499.60");
  });

  it("describe los períodos y el estado", () => {
    expect(c).toMatchObject({
      estado: "resultados",
      formato: "clase",
      titulo: "Estado de resultados",
      periodoA: { desde: "2026-10-01", hasta: "2026-10-31" },
      periodoB: { desde: "2026-09-01", hasta: "2026-09-30" },
    });
  });

  it("no pierde centavos al sumar montos decimales (0.10 + 0.20)", () => {
    const x = compararResultados(
      er([fila("510101", "0", "0.30")]),
      er([fila("510101", "0", "0.10"), fila("510102", "0", "0.20")]),
    );
    expect(x.filas.find((f) => f.id === "ventas:total")).toMatchObject({
      periodoA: "0.30",
      periodoB: "0.30",
      variacion: "0.00",
      porcentaje: "0.00",
    });
  });
});

describe("compararBalances", () => {
  const al = (fecha: string, filas: FilaSaldos[]) =>
    armarBalanceGeneral({ fecha, sucursalId: null }, filas, NOMBRES);
  const a = al("2026-10-31", [
    fila("110101", "5000.00", "0"),
    fila("2102", "0", "1200.00"),
    fila("3101", "0", "3800.00"),
  ]);
  const b = al("2026-09-30", [fila("110101", "2000.00", "0"), fila("3101", "0", "2000.00")]);
  const c = compararBalances(a, b);
  const por = (id: string) => c.filas.find((f) => f.id === id)!;

  it("compara fechas: los totales y el cuadre salen de cada balance", () => {
    expect(c).toMatchObject({
      estado: "balance-general",
      periodoA: { desde: null, hasta: "2026-10-31" },
      periodoB: { desde: null, hasta: "2026-09-30" },
    });
    expect(por("totalActivo")).toMatchObject({
      periodoA: "5000.00",
      periodoB: "2000.00",
      variacion: "3000.00",
      porcentaje: "150.00",
    });
    expect(por("totalPasivoPatrimonio")).toMatchObject({ periodoA: "5000.00", periodoB: "2000.00" });
  });

  it("el pasivo que no existía en el período B tiene variación pero no porcentaje", () => {
    expect(por("pasivoCorriente:2102")).toMatchObject({
      periodoA: "1200.00",
      periodoB: "0.00",
      variacion: "1200.00",
      porcentaje: null,
    });
  });

  it("la utilidad del ejercicio en curso (renglón calculado) se alinea entre períodos", () => {
    const x = compararBalances(
      al("2026-10-31", [fila("110101", "500.00", "0"), fila("510101", "0", "500.00")]),
      al("2026-09-30", [fila("110101", "300.00", "0"), fila("510101", "0", "300.00")]),
    );
    const calculados = x.filas.filter((f) => f.id.startsWith("patrimonio:calculado"));
    expect(calculados).toHaveLength(1);
    expect(calculados[0]).toMatchObject({ periodoA: "500.00", periodoB: "300.00", variacion: "200.00" });
  });

  it("utilidad del ejercicio en un período y pérdida en el otro salen en una sola fila", () => {
    const x = compararBalances(
      al("2026-10-31", [fila("110101", "500.00", "0"), fila("510101", "0", "500.00")]),
      al("2026-09-30", [
        fila("110101", "300.00", "0"),
        fila("420101", "100.00", "0"),
        fila("3101", "0", "400.00"),
      ]),
    );
    const calculados = x.filas.filter((f) => f.id.startsWith("patrimonio:calculado"));
    expect(calculados).toHaveLength(1);
    expect(calculados[0]).toMatchObject({
      periodoA: "500.00",
      periodoB: "-100.00",
      variacion: "600.00",
      porcentaje: "600.00",
    });
    const inverso = compararBalances(
      al("2026-09-30", [
        fila("110101", "300.00", "0"),
        fila("420101", "100.00", "0"),
        fila("3101", "0", "400.00"),
      ]),
      al("2026-10-31", [fila("110101", "500.00", "0"), fila("510101", "0", "500.00")]),
    );
    const unico = inverso.filas.filter((f) => f.id.startsWith("patrimonio:calculado"));
    expect(unico).toHaveLength(1);
    expect(unico[0]).toMatchObject({ periodoA: "-100.00", periodoB: "500.00", variacion: "-600.00" });
  });
});
