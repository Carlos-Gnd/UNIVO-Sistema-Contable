import { describe, expect, it } from "vitest";
import {
  EmpresaNoEncontradaError,
  PeriodoFueraDeEjercicioError,
  SinPermisoReportesError,
  SucursalNoAutorizadaError,
  type AccesoReportes,
  type ConsultaSaldos,
  type FilaSaldos,
} from "../domain/balanza.js";
import type { RepositorioBalanza, UnidadBalanza } from "../domain/repositorio-balanza.js";
import { ConsultarBalanza } from "./consultar-balanza.js";

const TODAS: AccesoReportes = { permisos: new Set(["reportes.ver"]), todasSucursales: true, sucursales: [] };
const filas: FilaSaldos[] = [
  {
    cuentaId: "c1",
    codigo: "1101",
    nombre: "Caja",
    naturaleza: "deudora",
    tipo: "activo",
    saldoInicial: "0",
    movimientoDebe: "10.00",
    movimientoHaber: "0",
  },
  {
    cuentaId: "c2",
    codigo: "5101",
    nombre: "Ventas",
    naturaleza: "acreedora",
    tipo: "ingresos",
    saldoInicial: "0",
    movimientoDebe: "0",
    movimientoHaber: "10.00",
  },
];

function caso(
  o: {
    acceso?: AccesoReportes | null;
    sucursalExiste?: boolean;
    ejercicio?: { inicio: string; fin: string } | null;
  } = {},
) {
  let pedido: ConsultaSaldos | undefined;
  const unidad: UnidadBalanza = {
    acceso: async () => (o.acceso === undefined ? TODAS : o.acceso),
    existeSucursal: async () => o.sucursalExiste ?? true,
    ejercicioDe: async () =>
      o.ejercicio === undefined ? { inicio: "2026-01-01", fin: "2026-12-31" } : o.ejercicio,
    saldos: async (consulta) => {
      pedido = consulta;
      return filas;
    },
  };
  const repo: RepositorioBalanza = { enTransaccion: (_u, fn) => fn(unidad) };
  return { casos: new ConsultarBalanza(repo), pedido: () => pedido };
}

const periodo = { desde: "2026-11-01", hasta: "2026-11-30" };

describe("ConsultarBalanza", () => {
  it("devuelve la balanza consolidada con el ejercicio del período", async () => {
    const c = caso();
    const b = await c.casos.ejecutar("u", "e", "ajustada", periodo);
    expect(b).toMatchObject({ tipo: "ajustada", sucursalId: null, cuadra: true });
    expect(b.lineas.map((l) => l.codigo)).toEqual(["1101", "5101"]);
    expect(c.pedido()).toEqual({
      empresaId: "e",
      tipo: "ajustada",
      ...periodo,
      inicioEjercicio: "2026-01-01",
      sucursales: null,
    });
  });

  it("filtra por la sucursal pedida", async () => {
    const c = caso();
    const b = await c.casos.ejecutar("u", "e", "antes-ajustes", { ...periodo, sucursalId: "s1" });
    expect(b.sucursalId).toBe("s1");
    expect(c.pedido()?.sucursales).toEqual(["s1"]);
  });

  it("quien está limitado a sus sucursales consolida solo las suyas", async () => {
    const c = caso({
      acceso: { permisos: new Set(["reportes.ver"]), todasSucursales: false, sucursales: ["s1", "s2"] },
    });
    await c.casos.ejecutar("u", "e", "ajustada", periodo);
    expect(c.pedido()?.sucursales).toEqual(["s1", "s2"]);
  });

  it("rechaza una sucursal fuera del alcance o inexistente", async () => {
    const limitado = caso({
      acceso: { permisos: new Set(["reportes.ver"]), todasSucursales: false, sucursales: ["s1"] },
    });
    await expect(
      limitado.casos.ejecutar("u", "e", "ajustada", { ...periodo, sucursalId: "s9" }),
    ).rejects.toThrow(SucursalNoAutorizadaError);
    const inexistente = caso({ sucursalExiste: false });
    await expect(
      inexistente.casos.ejecutar("u", "e", "ajustada", { ...periodo, sucursalId: "x" }),
    ).rejects.toThrow(SucursalNoAutorizadaError);
    expect(inexistente.pedido()).toBeUndefined();
  });

  it("exige membresía y el permiso reportes.ver", async () => {
    await expect(caso({ acceso: null }).casos.ejecutar("u", "e", "ajustada", periodo)).rejects.toThrow(
      EmpresaNoEncontradaError,
    );
    await expect(
      caso({
        acceso: { permisos: new Set(["partidas.ver"]), todasSucursales: true, sucursales: [] },
      }).casos.ejecutar("u", "e", "ajustada", periodo),
    ).rejects.toThrow(SinPermisoReportesError);
  });

  it("el período debe estar dentro de un ejercicio", async () => {
    await expect(caso({ ejercicio: null }).casos.ejecutar("u", "e", "ajustada", periodo)).rejects.toThrow(
      /No hay un ejercicio/,
    );
    const cruza = caso();
    await expect(
      cruza.casos.ejecutar("u", "e", "ajustada", { desde: "2026-11-01", hasta: "2027-01-31" }),
    ).rejects.toThrow(PeriodoFueraDeEjercicioError);
    expect(cruza.pedido()).toBeUndefined();
  });
});
