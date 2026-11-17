import { describe, expect, it } from "vitest";
import {
  conceptoDeReversion,
  FechaReversionInvalidaError,
  lineasDeReversion,
  MotivoAnulacionRequeridoError,
  PartidaNoAnulableError,
  type DatosReversion,
  type PartidaAnulable,
} from "../domain/anulacion.js";
import { ReglaContableError } from "../domain/contabilizacion.js";
import {
  EmpresaNoEncontradaError,
  PartidaNoEncontradaError,
  SinPermisoPartidasError,
  type AccesoPartidas,
} from "../domain/partida-borrador.js";
import type { RepositorioAnulacion, UnidadAnulacion } from "../domain/repositorio-anulacion.js";
import { AnularPartida, hoyEnElSalvador } from "./anular-partida.js";

const ORIGINAL: PartidaAnulable = {
  id: "p1",
  sucursalId: "matriz",
  fecha: "2026-11-10",
  estado: "contabilizada",
  tipo: "operacion",
  numero: 7,
  ambito: "2026",
  documentoTipo: "factura",
  documentoNumero: "F-100",
  lineas: [
    { cuentaId: "caja", debe: "113.00", haber: "0.00", concepto: "Cobro" },
    { cuentaId: "ventas", debe: "0.00", haber: "100.00", concepto: null },
    { cuentaId: "iva", debe: "0.00", haber: "13.00", concepto: null },
  ],
};

interface Opciones {
  acceso?: AccesoPartidas | null;
  partida?: Partial<PartidaAnulable> | null;
  falla?: "reversion" | "contabilizar";
}

function caso(o: Opciones = {}) {
  const llamadas: string[] = [];
  let reversion: DatosReversion | undefined;
  let anulacion: { id: string; motivo: string } | undefined;
  const acceso: AccesoPartidas | null =
    o.acceso === undefined
      ? { permisos: new Set(["partidas.anular"]), todasSucursales: true, sucursales: [] }
      : o.acceso;
  const unidad: UnidadAnulacion = {
    acceso: async () => acceso,
    bloquear: async () => (o.partida === null ? null : { ...ORIGINAL, ...o.partida }),
    crearReversion: async (_e, datos) => {
      llamadas.push("crear");
      if (o.falla === "reversion") throw new ReglaContableError("El período de 11/2026 está cerrado");
      reversion = datos;
      return "p2";
    },
    contabilizar: async () => {
      llamadas.push("contabilizar");
      if (o.falla === "contabilizar") throw new ReglaContableError("La reversión no cuadra");
      return { numero: 8, ambito: "2026" };
    },
    anular: async (id, motivo) => {
      llamadas.push("anular");
      anulacion = { id, motivo };
    },
  };
  const repo: RepositorioAnulacion = { enTransaccion: (_u, fn) => fn(unidad) };
  return { casos: new AnularPartida(repo), llamadas, reversion: () => reversion, anulacion: () => anulacion };
}

const anular = (
  c: ReturnType<typeof caso>,
  datos: { motivo: string; fecha?: string } = { motivo: "Duplicada", fecha: "2026-11-12" },
) => c.casos.ejecutar("u", "e", "p1", datos);

describe("AnularPartida", () => {
  it("registra una reversión que invierte debe y haber, la contabiliza y anula la original con su motivo", async () => {
    const c = caso();
    const r = await anular(c, { motivo: "  Duplicada  ", fecha: "2026-11-12" });

    expect(r).toEqual({
      original: { id: "p1", numero: 7, ambito: "2026" },
      reversion: { id: "p2", fecha: "2026-11-12", numero: 8, ambito: "2026" },
    });
    expect(c.reversion()).toEqual({
      partidaRevertidaId: "p1",
      sucursalId: "matriz",
      fecha: "2026-11-12",
      concepto: "Reversión de la partida N.º 7 (2026): Duplicada",
      documentoTipo: "factura",
      documentoNumero: "F-100",
      lineas: [
        { cuentaId: "caja", debe: "0.00", haber: "113.00", concepto: "Cobro" },
        { cuentaId: "ventas", debe: "100.00", haber: "0.00", concepto: null },
        { cuentaId: "iva", debe: "13.00", haber: "0.00", concepto: null },
      ],
    });
    expect(c.anulacion()).toEqual({ id: "p1", motivo: "Duplicada" });
    // la original se anula al final: si la reversión falla, no se anula
    expect(c.llamadas).toEqual(["crear", "contabilizar", "anular"]);
  });

  it("sin fecha, la reversión se registra con la de hoy en El Salvador", async () => {
    const c = caso({ partida: { fecha: "2026-01-01" } });
    const r = await anular(c, { motivo: "Error" });
    expect(r.reversion.fecha).toBe(hoyEnElSalvador());
  });

  it.each(["", "   ", "x".repeat(501)])("exige un motivo válido (%#)", async (motivo) => {
    const c = caso();
    expect(() => anular(c, { motivo })).toThrow(MotivoAnulacionRequeridoError);
    expect(c.llamadas).toEqual([]);
  });

  it("exige el permiso partidas.anular y la membresía en la empresa", async () => {
    await expect(
      anular(
        caso({ acceso: { permisos: new Set(["partidas.ver"]), todasSucursales: true, sucursales: [] } }),
      ),
    ).rejects.toThrow(SinPermisoPartidasError);
    await expect(anular(caso({ acceso: null }))).rejects.toThrow(EmpresaNoEncontradaError);
  });

  it("trata como inexistente la partida ausente o de una sucursal que el usuario no ve", async () => {
    await expect(anular(caso({ partida: null }))).rejects.toThrow(PartidaNoEncontradaError);
    const sinSucursal = caso({
      acceso: { permisos: new Set(["partidas.anular"]), todasSucursales: false, sucursales: ["otra"] },
    });
    await expect(anular(sinSucursal)).rejects.toThrow(PartidaNoEncontradaError);
    expect(sinSucursal.llamadas).toEqual([]);
  });

  it.each([
    ["un borrador", { estado: "borrador" as const }, /borrador no se anula/],
    ["una partida ya anulada", { estado: "anulada" as const }, /ya está anulada/],
    ["una reversión", { tipo: "reversion" as const }, /reversión no se anula/],
  ])("no anula %s", async (_, partida, mensaje) => {
    const c = caso({ partida });
    await expect(anular(c)).rejects.toThrow(PartidaNoAnulableError);
    await expect(anular(caso({ partida }))).rejects.toThrow(mensaje);
    expect(c.llamadas).toEqual([]);
  });

  it("no acepta una reversión con fecha anterior a la de la partida", async () => {
    const c = caso();
    await expect(anular(c, { motivo: "Error", fecha: "2026-11-09" })).rejects.toThrow(
      FechaReversionInvalidaError,
    );
    expect(c.llamadas).toEqual([]);
  });

  it("si la base rechaza la reversión (período cerrado, cuadre), no anula la original", async () => {
    for (const falla of ["reversion", "contabilizar"] as const) {
      const c = caso({ falla });
      await expect(anular(c)).rejects.toThrow(ReglaContableError);
      expect(c.llamadas).not.toContain("anular");
    }
  });
});

describe("reglas de la reversión", () => {
  it("lineasDeReversion intercambia debe y haber sin tocar los montos", () => {
    expect(lineasDeReversion(ORIGINAL.lineas).map((l) => [l.cuentaId, l.debe, l.haber])).toEqual([
      ["caja", "0.00", "113.00"],
      ["ventas", "100.00", "0.00"],
      ["iva", "13.00", "0.00"],
    ]);
    // no modifica las líneas originales
    expect(ORIGINAL.lineas[0]).toMatchObject({ debe: "113.00", haber: "0.00" });
  });

  it("conceptoDeReversion indica la partida y el motivo", () => {
    expect(conceptoDeReversion({ numero: 12, ambito: "2026-11" }, "Monto equivocado")).toBe(
      "Reversión de la partida N.º 12 (2026-11): Monto equivocado",
    );
    expect(conceptoDeReversion({ numero: null, ambito: null }, "Error")).toBe(
      "Reversión de la partida: Error",
    );
  });

  it("hoyEnElSalvador usa la zona de El Salvador y no la del servidor", () => {
    // 21:00 del 16 de noviembre en El Salvador ya es 17 de noviembre en UTC
    expect(hoyEnElSalvador(new Date("2026-11-17T03:00:00Z"))).toBe("2026-11-16");
    expect(hoyEnElSalvador(new Date("2026-11-17T07:00:00Z"))).toBe("2026-11-17");
  });
});
