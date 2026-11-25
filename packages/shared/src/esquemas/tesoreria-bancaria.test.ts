import { describe, expect, it } from "vitest";
import {
  cambiarEstadoChequeSchema,
  crearConciliacionBancariaSchema,
  crearMovimientoBancarioSchema,
  filtrarMovimientosBancariosSchema,
} from "./tesoreria";

const ID = "00000000-0000-4000-8000-000000000001";
const movimiento = {
  cuentaTesoreriaId: ID,
  sucursalId: ID,
  cuentaContrapartidaId: ID,
  tipo: "cheque",
  fecha: "2026-10-05",
  referencia: "CH-001",
  comprobante: "F-001",
  beneficiario: "Proveedor Uno",
  concepto: "Pago de servicios",
  monto: "226.5",
};

describe("esquemas de movimientos y conciliación bancaria", () => {
  it("normaliza importes y exige los datos del comprobante", () => {
    expect(crearMovimientoBancarioSchema.parse(movimiento)).toMatchObject({
      monto: "226.50",
      tipo: "cheque",
    });
    expect(crearMovimientoBancarioSchema.safeParse({ ...movimiento, monto: "0" }).success).toBe(false);
    expect(crearMovimientoBancarioSchema.safeParse({ ...movimiento, referencia: "" }).success).toBe(false);
    expect(crearMovimientoBancarioSchema.safeParse({ ...movimiento, tipo: "transferencia" }).success).toBe(
      false,
    );
  });

  it("valida el período y el saldo del corte", () => {
    expect(
      filtrarMovimientosBancariosSchema.safeParse({
        cuentaTesoreriaId: ID,
        desde: "2026-10-01",
        hasta: "2026-10-31",
      }).success,
    ).toBe(true);
    expect(
      filtrarMovimientosBancariosSchema.safeParse({
        cuentaTesoreriaId: ID,
        desde: "2026-10-31",
        hasta: "2026-10-01",
      }).success,
    ).toBe(false);
    expect(
      crearConciliacionBancariaSchema.safeParse({
        cuentaTesoreriaId: ID,
        fechaCorte: "2026-10-31",
        saldoEstado: "16655.59",
      }).success,
    ).toBe(true);
    expect(
      crearConciliacionBancariaSchema.safeParse({
        cuentaTesoreriaId: ID,
        fechaCorte: "2026-10-31",
        saldoEstado: "-1",
      }).success,
    ).toBe(false);
  });

  it("solo admite marcar los estados finales del cheque", () => {
    expect(cambiarEstadoChequeSchema.parse({ estado: "cobrado", fecha: "2026-10-06" })).toEqual({
      estado: "cobrado",
      fecha: "2026-10-06",
    });
    expect(cambiarEstadoChequeSchema.parse({ estado: "anulado", fecha: "2026-10-06" }).estado).toBe(
      "anulado",
    );
    expect(cambiarEstadoChequeSchema.safeParse({ estado: "emitido", fecha: "2026-10-06" }).success).toBe(
      false,
    );
  });
});
