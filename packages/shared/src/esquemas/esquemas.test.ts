import { describe, expect, expectTypeOf, it } from "vitest";
import {
  codigoCuentaSchema,
  crearCuentaSchema,
  crearEjercicioSchema,
  crearEmpresaSchema,
  crearPartidaSchema,
  crearSucursalSchema,
  montoSchema,
  nitSchema,
  validarPartida,
  type CrearPartida,
  type LineaPartida,
} from "../index";

const CUENTA = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";
const SUCURSAL = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";

describe("montoSchema", () => {
  it("normaliza a texto con dos decimales", () => {
    expect(montoSchema.parse("1250.1")).toBe("1250.10");
    expect(montoSchema.parse(13)).toBe("13.00");
    expect(montoSchema.parse("")).toBe("0.00");
  });

  it("rechaza negativos, notación exponencial y texto", () => {
    expect(montoSchema.safeParse("-5").success).toBe(false);
    expect(montoSchema.safeParse("1e9").success).toBe(false);
    expect(montoSchema.safeParse("abc").success).toBe(false);
  });
});

describe("organización", () => {
  it("acepta NIT de 14 dígitos y DUI homologado", () => {
    expect(nitSchema.safeParse("0614-010190-101-5").success).toBe(true);
    expect(nitSchema.safeParse("01234567-8").success).toBe(true);
    expect(nitSchema.safeParse("06140101901011").success).toBe(false);
  });

  it("aplica valores por defecto y descarta textos opcionales vacíos", () => {
    const empresa = crearEmpresaSchema.parse({
      nombre: "  Comercial Oriente, S.A. de C.V. ",
      nombreComercial: "",
      nit: "0614-010190-101-5",
      tipoContribuyente: "sociedad",
    });
    expect(empresa).toMatchObject({
      nombre: "Comercial Oriente, S.A. de C.V.",
      clasificacion: "otro",
      modoNumeracion: "anual",
    });
    expect(empresa.nombreComercial).toBeUndefined();
  });

  it("exige códigos de Hacienda de 4 dígitos en la sucursal", () => {
    const sucursal = crearSucursalSchema.parse({ nombre: "Matriz", codigoEstablecimiento: "0001" });
    expect(sucursal.codigoPuntoVenta).toBe("0001");
    expect(crearSucursalSchema.safeParse({ nombre: "Sur", codigoEstablecimiento: "1" }).success).toBe(false);
  });
});

describe("catálogo y ejercicios", () => {
  it("solo acepta códigos de 1, 2, 4, 6, 8 o 10 dígitos", () => {
    for (const codigo of ["1", "11", "1101", "110101", "11010101", "1101010101"]) {
      expect(codigoCuentaSchema.safeParse(codigo).success).toBe(true);
    }
    for (const codigo of ["110", "11010", "11-01", ""]) {
      expect(codigoCuentaSchema.safeParse(codigo).success).toBe(false);
    }
  });

  it("valida la cuenta completa", () => {
    const cuenta = crearCuentaSchema.parse({
      codigo: "1101",
      nombre: "Efectivo y equivalentes",
      naturaleza: "deudora",
      tipo: "activo",
    });
    expect(cuenta.activa).toBe(true);
    expect(crearCuentaSchema.safeParse({ ...cuenta, tipo: "gasto" }).success).toBe(false);
  });

  it("exige que el ejercicio termine después de empezar", () => {
    const r = crearEjercicioSchema.safeParse({
      anio: 2026,
      fechaInicio: "2026-12-31",
      fechaFin: "2026-01-01",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["fechaFin"]);
  });
});

describe("crearPartidaSchema", () => {
  const entrada = {
    sucursalId: SUCURSAL,
    fecha: "2026-11-10",
    concepto: "Venta al contado",
    lineas: [
      { cuentaId: CUENTA, debe: "113" },
      { cuentaId: CUENTA, haber: 113 },
    ],
  };

  it("normaliza montos y aplica el tipo por defecto", () => {
    const partida = crearPartidaSchema.parse(entrada);
    expect(partida.tipo).toBe("operacion");
    expect(partida.lineas).toEqual([
      { cuentaId: CUENTA, debe: "113.00", haber: "0.00" },
      { cuentaId: CUENTA, debe: "0.00", haber: "113.00" },
    ]);
  });

  it("rechaza fechas mal formadas, partidas sin líneas e identificadores inválidos", () => {
    expect(crearPartidaSchema.safeParse({ ...entrada, fecha: "10/11/2026" }).success).toBe(false);
    expect(crearPartidaSchema.safeParse({ ...entrada, lineas: [] }).success).toBe(false);
    expect(crearPartidaSchema.safeParse({ ...entrada, sucursalId: "1" }).success).toBe(false);
  });

  it("produce líneas que validarPartida acepta directamente", () => {
    const partida = crearPartidaSchema.parse(entrada);
    expectTypeOf(partida.lineas).toExtend<LineaPartida[]>();
    const cuentas = new Map([[CUENTA, { id: CUENTA, codigo: "1101", activa: true, imputable: true }]]);
    expect(validarPartida(partida.lineas, cuentas).puedeContabilizarse).toBe(true);
    expectTypeOf<CrearPartida["fecha"]>().toEqualTypeOf<string>();
  });
});
