// Armado del estado de flujo de efectivo por el método indirecto (HU-41, S3-T22 y S3-T24).
import type { Naturaleza, TipoCuenta } from "@contable/shared";
import { Dinero } from "@contable/shared";
import { describe, expect, it } from "vitest";
import type { FilaSaldos } from "./balanza.js";
import { armarFlujoEfectivo } from "./flujo-efectivo.js";

const TIPO: Record<string, TipoCuenta> = {
  "1": "activo",
  "2": "pasivo",
  "3": "patrimonio",
  "4": "costos_gastos",
  "5": "ingresos",
  "6": "liquidadora",
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

const PERIODO = { desde: "2026-10-01", hasta: "2026-10-31", sucursalId: null };
const monto = (e: ReturnType<typeof armarFlujoEfectivo>["operacion"], id: string) =>
  e.renglones.find((r) => r.id === id)?.monto;

/**
 * Un primer mes con apertura (aporte en efectivo y en mobiliario), compra y venta de inventario, un gasto
 * pagado en parte, la depreciación y un retiro. Las partidas cuadran: el debe es igual al haber.
 */
const MES_UNO: FilaSaldos[] = [
  fila("11010301", "25000.00", "6850.00"),
  fila("1103", "600.00", "0"),
  fila("1109", "6000.00", "3000.00"),
  fila("120105", "2500.00", "0"),
  fila("120204", "0", "100.00"),
  fila("210701", "0", "600.00"),
  fila("310101", "0", "22500.00"),
  fila("310801", "450.00", "0"),
  fila("510101", "0", "5600.00"),
  fila("4104", "3000.00", "0"),
  fila("420101", "1000.00", "0"),
  fila("420122", "100.00", "0"),
];

describe("armarFlujoEfectivo: primer mes con apertura", () => {
  const e = armarFlujoEfectivo(PERIODO, MES_UNO);

  it("la variación neta de las actividades es la de las cuentas de efectivo", () => {
    expect(e.cuadra).toBe(true);
    expect(e.variacionNeta).toBe(e.variacionLibros);
    expect(e.efectivoInicial).toBe("0.00");
    expect(e.efectivoFinal).toBe(Dinero.de("25000.00").menos("6850.00").aTexto());
  });

  it("parte de la utilidad neta y suma la depreciación, que no mueve efectivo", () => {
    expect(e.operacion.renglones[0]).toMatchObject({ id: "utilidad-neta", monto: "1500.00" });
    expect(monto(e.operacion, "depreciacion")).toBe("100.00");
  });

  it("clasifica el capital de trabajo con el signo de su efecto en el efectivo", () => {
    expect(monto(e.operacion, "inventarios")).toBe("-3000.00");
    expect(monto(e.operacion, "cuentas-por-cobrar")).toBe("-600.00");
    expect(monto(e.operacion, "empleados")).toBe("600.00");
    expect(e.operacion.total).toBe("-1400.00");
    expect(e.operacion.renglones.find((r) => r.id === "inventarios")?.concepto).toBe(
      "(−) Aumento de inventarios",
    );
    expect(e.operacion.renglones.find((r) => r.id === "empleados")?.concepto).toBe(
      "(+) Aumento de obligaciones con empleados",
    );
  });

  it("el aporte y los retiros son financiamiento, y el mobiliario inversión", () => {
    expect(monto(e.financiamiento, "aportes")).toBe("22500.00");
    expect(monto(e.financiamiento, "retiros")).toBe("-450.00");
    expect(monto(e.inversion, "activo-fijo")).toBe("-2500.00");
  });
});

describe("armarFlujoEfectivo: con saldos iniciales y cambios del período", () => {
  const filas: FilaSaldos[] = [
    fila("11010301", "3000.00", "1500.00", "10000.00"),
    fila("1103", "800.00", "1200.00", "1000.00"), // se cobró más de lo vendido a crédito: disminuyó 400
    fila("1109", "0", "300.00", "2000.00"),
    fila("120105", "1000.00", "0", "2500.00"),
    fila("120204", "0", "50.00"),
    fila("2105", "0", "1350.00", "0"),
    fila("2102", "200.00", "0", "500.00"),
    fila("3101", "0", "0", "-14000.00"),
    fila("510101", "0", "1000.00"),
    fila("420101", "400.00", "0"),
    // Una cuenta de resultado con saldo anterior al período no cuenta como resultado del período
    fila("420134", "0", "0", "100.00"),
  ];
  const e = armarFlujoEfectivo({ desde: "2026-11-01", hasta: "2026-11-30", sucursalId: null }, filas);

  it("cuadra y arrastra el efectivo inicial", () => {
    expect(e.efectivoInicial).toBe("10000.00");
    expect(e.variacionLibros).toBe("1500.00");
    expect(e.efectivoFinal).toBe("11500.00");
    expect(e.cuadra).toBe(true);
  });

  it("muestra disminuciones con (+) en activos y aumentos de préstamos en financiamiento", () => {
    expect(e.operacion.renglones.find((r) => r.id === "cuentas-por-cobrar")).toMatchObject({
      concepto: "(+) Disminución de cuentas por cobrar",
      monto: "400.00",
    });
    expect(e.operacion.renglones.find((r) => r.id === "proveedores")).toMatchObject({
      concepto: "(−) Disminución de cuentas por pagar a proveedores",
      monto: "-200.00",
    });
    expect(monto(e.financiamiento, "prestamos")).toBe("1350.00");
    expect(monto(e.inversion, "activo-fijo")).toBe("-1000.00");
    expect(e.operacion.renglones[0]?.monto).toBe("600.00");
  });
});

describe("armarFlujoEfectivo: otros casos", () => {
  it("sin movimientos solo muestra la utilidad neta en cero y cuadra", () => {
    const e = armarFlujoEfectivo(PERIODO, []);
    expect(e.operacion.renglones.map((r) => r.id)).toEqual(["utilidad-neta"]);
    expect(e.variacionNeta).toBe("0.00");
    expect(e.cuadra).toBe(true);
  });

  it("las cuentas fuera del catálogo base caen en «otros» y el flujo sigue cuadrando", () => {
    const e = armarFlujoEfectivo(PERIODO, [
      fila("110101", "500.00", "0"),
      fila("1114", "0", "0", "0"),
      fila("1199", "100.00", "0"),
      fila("2199", "0", "300.00"),
      fila("2299", "0", "200.00"),
      fila("3199", "0", "100.00"),
    ]);
    expect(e.cuadra).toBe(true);
    expect(monto(e.operacion, "otros-activos")).toBe("-100.00");
    expect(monto(e.operacion, "otros-pasivos")).toBe("300.00");
    expect(monto(e.financiamiento, "otros-pasivos-no-corrientes")).toBe("200.00");
  });

  it("el formato NIIF cambia los nombres, no las cifras", () => {
    const clase = armarFlujoEfectivo(PERIODO, MES_UNO, "clase");
    const niif = armarFlujoEfectivo(PERIODO, MES_UNO, "niif_pymes");
    expect(niif.titulo).toBe("Estado de flujos de efectivo");
    expect(niif.operacion.total).toBe(clase.operacion.total);
    expect(niif.efectivoFinal).toBe(clase.efectivoFinal);
  });
});
