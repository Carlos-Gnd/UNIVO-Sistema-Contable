import { describe, expect, it } from "vitest";
import {
  buscarCuentas,
  calcularPartida,
  limpiarMonto,
  montoDeTexto,
  montoParaApi,
  prepararCuentas,
  pulirMonto,
  type FilaPartida,
} from "./lineas";
import type { CuentaCatalogo } from "./tipos";

const cuenta = (
  id: string,
  codigo: string,
  nombre: string,
  extra: Partial<CuentaCatalogo> = {},
): CuentaCatalogo => ({
  id,
  codigo,
  nombre,
  nivel: codigo.length,
  naturaleza: "deudora",
  tipo: "activo",
  cuentaPadreId: null,
  activa: true,
  ...extra,
});

const CATALOGO = prepararCuentas([
  cuenta("c1", "1101", "Efectivo y equivalentes"),
  cuenta("c2", "110101", "Caja general", { cuentaPadreId: "c1" }),
  cuenta("c3", "110102", "Bancos", { cuentaPadreId: "c1" }),
  cuenta("c4", "110103", "Caja chica", { cuentaPadreId: "c1", activa: false }),
  cuenta("c5", "5101", "Energía eléctrica", { naturaleza: "deudora", tipo: "costos_gastos" }),
]);

const fila = (cuentaId: string, debe: string, haber: string): FilaPartida => ({
  clave: cuentaId + debe + haber,
  cuentaId,
  codigo: "",
  nombre: "",
  debe,
  haber,
});

describe("montos del formulario", () => {
  it("deja solo dígitos, un punto y dos decimales", () => {
    expect(limpiarMonto("1,250.555")).toBe("1250.55");
    expect(limpiarMonto("12a3.4.5")).toBe("123.45");
    expect(limpiarMonto("-50")).toBe("50");
    expect(limpiarMonto("")).toBe("");
    expect(limpiarMonto("9999999999999")).toBe("999999999999");
  });

  it("interpreta textos a medio escribir", () => {
    expect(montoDeTexto("12.")).toBe("12");
    expect(montoDeTexto(".5")).toBe("0.5");
    expect(montoDeTexto("1,250.50")).toBe("1250.50");
    expect(montoDeTexto("")).toBe("0");
  });

  it("formatea al salir del campo y envía dos decimales a la API", () => {
    expect(pulirMonto("1250.5")).toBe("1,250.50");
    expect(pulirMonto("0")).toBe("");
    expect(montoParaApi("1,250.5")).toBe("1250.50");
    expect(montoParaApi("")).toBe("0.00");
  });
});

describe("catálogo para partidas", () => {
  it("deduce las cuentas de último nivel cuando la API no lo indica", () => {
    expect(CATALOGO.find((c) => c.id === "c1")?.imputable).toBe(false);
    expect(CATALOGO.find((c) => c.id === "c2")?.imputable).toBe(true);
  });

  it("respeta imputable cuando la API lo envía", () => {
    const [c] = prepararCuentas([cuenta("x", "1", "Activo", { imputable: true })]);
    expect(c?.imputable).toBe(true);
  });

  it("solo ofrece cuentas activas de último nivel", () => {
    expect(buscarCuentas(CATALOGO, "").map((c) => c.codigo)).toEqual(["110101", "110102", "5101"]);
  });

  it("busca por inicio del código o por nombre sin tildes ni mayúsculas", () => {
    expect(buscarCuentas(CATALOGO, "1101").map((c) => c.codigo)).toEqual(["110101", "110102"]);
    expect(buscarCuentas(CATALOGO, "ENERGIA").map((c) => c.codigo)).toEqual(["5101"]);
    expect(buscarCuentas(CATALOGO, "caja").map((c) => c.codigo)).toEqual(["110101"]);
    expect(buscarCuentas(CATALOGO, "01")).toEqual([]);
  });
});

describe("totales en vivo", () => {
  it("suma con decimales exactos y detecta el cuadre", () => {
    const r = calcularPartida(
      [fila("c2", "0.10", ""), fila("c3", "0.20", ""), fila("c5", "", "0.30")],
      CATALOGO,
    );
    expect(r).toMatchObject({ totalDebe: "0.30", totalHaber: "0.30", diferencia: "0.00", cuadra: true });
    expect(r.puedeContabilizarse).toBe(true);
  });

  it("calcula la diferencia de una partida descuadrada", () => {
    const r = calcularPartida([fila("c2", "1,000.00", ""), fila("c5", "", "850.5")], CATALOGO);
    expect(r).toMatchObject({
      totalDebe: "1000.00",
      totalHaber: "850.50",
      diferencia: "149.50",
      cuadra: false,
    });
  });

  it("marca las líneas sin monto o con cuentas que no se pueden usar", () => {
    const r = calcularPartida([fila("c2", "", ""), fila("c1", "5", ""), fila("c4", "", "5")], CATALOGO);
    expect(r.errores.map((e) => [e.linea, e.codigo])).toEqual([
      [0, "SIN_MONTO"],
      [1, "CUENTA_NO_IMPUTABLE"],
      [2, "CUENTA_INACTIVA"],
    ]);
  });
});
