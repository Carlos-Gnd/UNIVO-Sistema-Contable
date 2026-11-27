import type { CrearPartida, CuentaInfo, PartidaVersionVista, PartidaVista } from "@contable/shared";
import { describe, expect, it } from "vitest";
import {
  EmpresaNoEncontradaError,
  LineasInvalidasError,
  NoEsBorradorError,
  PartidaNoEncontradaError,
  SinPermisoPartidasError,
  SucursalNoAutorizadaError,
  type PartidaExistente,
  type RepositorioPartidas,
  type UnidadPartidas,
} from "../domain/partida-borrador.js";
import { PartidasBorrador } from "./partidas-borrador.js";

const CUENTAS: CuentaInfo[] = [
  { id: "caja", codigo: "110101", activa: true, imputable: true },
  { id: "ventas", codigo: "5101", activa: true, imputable: true },
  { id: "efectivo", codigo: "1101", activa: true, imputable: false },
  { id: "vieja", codigo: "110102", activa: false, imputable: true },
];

const datos = (lineas: [string, string, string][], sucursalId = "matriz"): CrearPartida => ({
  sucursalId,
  fecha: "2026-11-10",
  tipo: "operacion",
  lineas: lineas.map(([cuentaId, debe, haber]) => ({ cuentaId, debe, haber })),
});

interface Opciones {
  permisos?: string[];
  /** Sin valor: ve todas las sucursales */
  asignadas?: string[];
  miembro?: boolean;
  existentes?: PartidaExistente[];
  borradores?: PartidaVista[];
  versiones?: PartidaVersionVista[];
}

/** Repositorio en memoria que registra lo que se guardó. */
function caso(o: Opciones = {}) {
  const guardadas = new Map<string, CrearPartida>();
  let alcanceBorradores: {
    empresaId: string;
    todasSucursales: boolean;
    sucursales: readonly string[];
  } | null = null;
  const unidad: UnidadPartidas = {
    acceso: async () =>
      o.miembro === false
        ? null
        : {
            permisos: new Set(o.permisos ?? ["partidas.ver", "partidas.registrar"]),
            todasSucursales: o.asignadas === undefined,
            sucursales: o.asignadas ?? [],
          },
    cuentas: async (_e, ids) => CUENTAS.filter((c) => ids.includes(c.id)),
    bloquear: async (_e, id) => o.existentes?.find((p) => p.id === id) ?? null,
    listarBorradores: async (empresaId, todasSucursales, sucursales) => {
      alcanceBorradores = { empresaId, todasSucursales, sucursales };
      return o.borradores ?? [];
    },
    versiones: async () => o.versiones ?? [],
    crear: async (_e, d) => {
      guardadas.set("nueva", d);
      return "nueva";
    },
    reemplazar: async (id, d) => {
      guardadas.set(id, d);
    },
    leer: async (_e, id) => {
      const d = guardadas.get(id);
      const existente = o.existentes?.find((p) => p.id === id);
      if (!d && !existente) return null;
      return { id, sucursalId: d?.sucursalId ?? existente?.sucursalId } as PartidaVista;
    },
  };
  const repo: RepositorioPartidas = { enTransaccion: (_u, fn) => fn(unidad) };
  return { casos: new PartidasBorrador(repo), guardadas, obtenerAlcanceBorradores: () => alcanceBorradores };
}

describe("PartidasBorrador.listarBorradores", () => {
  it("devuelve los borradores con su diferencia y limita la consulta a sucursales asignadas", async () => {
    const partida = {
      id: "borrador",
      sucursalId: "matriz",
      fecha: "2026-11-10",
      tipo: "operacion",
      estado: "borrador",
      numero: null,
      concepto: "Compra",
      documentoTipo: null,
      documentoNumero: null,
      origen: "manual",
      lineas: [],
      explicacionDidactica: null,
      totalDebe: "100.00",
      totalHaber: "90.00",
      diferencia: "10.00",
      cuadra: false,
      creadoEn: "2026-11-10T12:00:00.000Z",
      actualizadoEn: "2026-11-10T12:00:00.000Z",
    } as PartidaVista;
    const { casos, obtenerAlcanceBorradores } = caso({ asignadas: ["matriz"], borradores: [partida] });

    await expect(casos.listarBorradores("u", "e")).resolves.toEqual([partida]);
    expect(obtenerAlcanceBorradores()).toEqual({
      empresaId: "e",
      todasSucursales: false,
      sucursales: ["matriz"],
    });
  });

  it("requiere membresía activa y permiso partidas.ver", async () => {
    await expect(caso({ miembro: false }).casos.listarBorradores("u", "e")).rejects.toThrow(
      EmpresaNoEncontradaError,
    );
    await expect(caso({ permisos: [] }).casos.listarBorradores("u", "e")).rejects.toThrow(
      SinPermisoPartidasError,
    );
  });
});

describe("PartidasBorrador.crear", () => {
  it("guarda un borrador aunque no cuadre", async () => {
    const { casos, guardadas } = caso();
    const d = datos([
      ["caja", "100.00", "0.00"],
      ["ventas", "0.00", "90.00"],
    ]);
    await expect(casos.crear("u", "e", d)).resolves.toMatchObject({ id: "nueva" });
    expect(guardadas.get("nueva")).toBe(d);
  });

  it("rechaza las líneas con cuentas no imputables, inactivas o ajenas, sin guardar nada", async () => {
    const { casos, guardadas } = caso();
    const error = await casos
      .crear(
        "u",
        "e",
        datos([
          ["caja", "10.00", "0.00"],
          ["efectivo", "0.00", "5.00"],
          ["vieja", "0.00", "3.00"],
          ["de-otra-empresa", "0.00", "2.00"],
          ["ventas", "0.00", "0.00"],
        ]),
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LineasInvalidasError);
    expect((error as LineasInvalidasError).errores.map((e) => [e.linea, e.codigo])).toEqual([
      [1, "CUENTA_NO_IMPUTABLE"],
      [2, "CUENTA_INACTIVA"],
      [3, "CUENTA_INEXISTENTE"],
      [4, "SIN_MONTO"],
    ]);
    expect(guardadas.size).toBe(0);
  });

  it("exige membresía, el permiso partidas.registrar y acceso a la sucursal", async () => {
    const d = datos([["caja", "1.00", "0.00"]]);
    await expect(caso({ miembro: false }).casos.crear("u", "e", d)).rejects.toThrow(EmpresaNoEncontradaError);
    await expect(caso({ permisos: ["partidas.ver"] }).casos.crear("u", "e", d)).rejects.toThrow(
      SinPermisoPartidasError,
    );
    await expect(caso({ asignadas: ["usulutan"] }).casos.crear("u", "e", d)).rejects.toThrow(
      SucursalNoAutorizadaError,
    );
    await expect(caso({ asignadas: ["matriz"] }).casos.crear("u", "e", d)).resolves.toBeDefined();
  });
});

describe("PartidasBorrador.editar", () => {
  const existentes: PartidaExistente[] = [
    { id: "b", sucursalId: "matriz", estado: "borrador" },
    { id: "c", sucursalId: "matriz", estado: "contabilizada" },
    { id: "s", sucursalId: "usulutan", estado: "borrador" },
  ];
  const d = datos([
    ["caja", "5.00", "0.00"],
    ["ventas", "0.00", "5.00"],
  ]);

  it("reemplaza un borrador", async () => {
    const { casos, guardadas } = caso({ existentes });
    await casos.editar("u", "e", "b", d);
    expect(guardadas.get("b")).toBe(d);
  });

  it("no edita una partida contabilizada", async () => {
    await expect(caso({ existentes }).casos.editar("u", "e", "c", d)).rejects.toThrow(NoEsBorradorError);
  });

  it("trata como inexistente la partida de otra empresa o de una sucursal no asignada", async () => {
    const limitado = caso({ existentes, asignadas: ["matriz"] }).casos;
    await expect(limitado.editar("u", "e", "x", d)).rejects.toThrow(PartidaNoEncontradaError);
    await expect(limitado.editar("u", "e", "s", d)).rejects.toThrow(PartidaNoEncontradaError);
  });

  it("no mueve un borrador a una sucursal no asignada", async () => {
    const { casos, guardadas } = caso({ existentes, asignadas: ["matriz"] });
    await expect(casos.editar("u", "e", "b", { ...d, sucursalId: "usulutan" })).rejects.toThrow(
      SucursalNoAutorizadaError,
    );
    expect(guardadas.size).toBe(0);
  });
});

describe("PartidasBorrador.consultar", () => {
  it("pide partidas.ver y oculta las sucursales no asignadas", async () => {
    const existentes: PartidaExistente[] = [{ id: "s", sucursalId: "usulutan", estado: "borrador" }];
    await expect(caso({ existentes, permisos: [] }).casos.consultar("u", "e", "s")).rejects.toThrow(
      SinPermisoPartidasError,
    );
    await expect(caso({ existentes, asignadas: ["matriz"] }).casos.consultar("u", "e", "s")).rejects.toThrow(
      PartidaNoEncontradaError,
    );
    await expect(caso({ existentes }).casos.consultar("u", "e", "s")).resolves.toMatchObject({ id: "s" });
  });
});

describe("PartidasBorrador.consultarVersiones", () => {
  it("requiere permiso de consulta y oculta partidas de sucursales no asignadas", async () => {
    const existentes: PartidaExistente[] = [{ id: "s", sucursalId: "usulutan", estado: "contabilizada" }];
    await expect(caso({ existentes, permisos: [] }).casos.consultarVersiones("u", "e", "s")).rejects.toThrow(
      SinPermisoPartidasError,
    );
    await expect(
      caso({ existentes, asignadas: ["matriz"] }).casos.consultarVersiones("u", "e", "s"),
    ).rejects.toThrow(PartidaNoEncontradaError);
    await expect(caso({ miembro: false }).casos.consultarVersiones("u", "e", "s")).rejects.toThrow(
      EmpresaNoEncontradaError,
    );
  });

  it("devuelve el historial de la partida accesible", async () => {
    const versiones = [{ version: 1, partida: { id: "s" } }] as PartidaVersionVista[];
    await expect(
      caso({
        existentes: [{ id: "s", sucursalId: "matriz", estado: "contabilizada" }],
        versiones,
      }).casos.consultarVersiones("u", "e", "s"),
    ).resolves.toEqual(versiones);
  });
});
