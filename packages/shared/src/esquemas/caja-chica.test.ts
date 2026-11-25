import { describe, expect, it } from "vitest";
import { crearCajaChicaSchema, crearValeCajaChicaSchema, reintegrarCajaChicaSchema } from "./tesoreria";

const ID = "10000000-0000-4000-8000-000000000001";

describe("esquemas de caja chica", () => {
  it("normaliza la apertura y exige un fondo positivo", () => {
    expect(
      crearCajaChicaSchema.parse({
        sucursalId: ID,
        cuentaTesoreriaId: ID,
        cuentaOrigenId: "10000000-0000-4000-8000-000000000002",
        fondoFijo: "200",
        fecha: "2026-10-01",
      }),
    ).toMatchObject({ fondoFijo: "200.00" });
    expect(
      crearCajaChicaSchema.safeParse({
        sucursalId: ID,
        cuentaTesoreriaId: ID,
        cuentaOrigenId: "10000000-0000-4000-8000-000000000002",
        fondoFijo: "0",
        fecha: "2026-10-01",
      }).success,
    ).toBe(false);
  });

  it("normaliza importes del vale y rechaza el total cero", () => {
    const datos = {
      fecha: "2026-10-02",
      comprobante: "F-001",
      concepto: "Papelería",
      montoNeto: "25",
      iva: "3.25",
      cuentaGastoId: ID,
    };
    expect(crearValeCajaChicaSchema.parse(datos)).toMatchObject({ montoNeto: "25.00", iva: "3.25" });
    expect(crearValeCajaChicaSchema.safeParse({ ...datos, montoNeto: "0", iva: "0" }).success).toBe(false);
  });

  it("valida la fecha y la cuenta de origen para un reintegro", () => {
    expect(reintegrarCajaChicaSchema.parse({ fecha: "2026-10-03", cuentaOrigenId: ID })).toEqual({
      fecha: "2026-10-03",
      cuentaOrigenId: ID,
    });
    expect(reintegrarCajaChicaSchema.safeParse({ fecha: "2026-02-30", cuentaOrigenId: ID }).success).toBe(
      false,
    );
  });
});
