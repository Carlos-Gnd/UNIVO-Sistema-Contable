import { describe, expect, it } from "vitest";
import {
  ReglaContableError,
  SinPermisoError,
  type PartidaPorContabilizar,
} from "../domain/contabilizacion.js";
import type {
  RepositorioContabilizacion,
  UnidadContabilizacion,
} from "../domain/repositorio-contabilizacion.js";
import { ContabilizarPartidas } from "./contabilizar-partidas.js";

const CAJA = { id: "caja", codigo: "110101", activa: true, imputable: true };
const VENTAS = { id: "ventas", codigo: "5101", activa: true, imputable: true };

const borrador = (id: string, debe = "10", haber = "10"): PartidaPorContabilizar => ({
  id,
  sucursalId: "matriz",
  fecha: "2026-11-10",
  estado: "borrador",
  lineas: [
    { cuentaId: "caja", debe, haber: "0" },
    { cuentaId: "ventas", debe: "0", haber },
  ],
  cuentas: [CAJA, VENTAS],
});

/** Repositorio en memoria: numera desde 1 y la base "rechaza" las partidas indicadas. */
function repositorio(
  partidas: PartidaPorContabilizar[],
  opciones: { puede?: boolean; rechaza?: string[]; asignadas?: string[] } = {},
) {
  let ultimo = 0;
  const unidad: UnidadContabilizacion = {
    acceso: async () => ({
      puedeContabilizar: opciones.puede ?? true,
      todasSucursales: opciones.asignadas === undefined,
      sucursales: opciones.asignadas ?? [],
    }),
    bloquearPartidas: async (_e, ids) => partidas.filter((p) => ids.includes(p.id)),
    contabilizar: async (id) => {
      if (opciones.rechaza?.includes(id)) throw new ReglaContableError("El período de 11/2026 está cerrado");
      return { numero: ++ultimo, ambito: "2026" };
    },
  };
  const repo: RepositorioContabilizacion = { enTransaccion: (_u, fn) => fn(unidad) };
  return new ContabilizarPartidas(repo);
}

describe("ContabilizarPartidas", () => {
  // Hoy la base solo permite sucursales asignadas al auxiliar y a consulta, que no contabilizan; la regla
  // se mantiene por si cambia la matriz de permisos.
  it("no contabiliza partidas de sucursales que el usuario no tiene asignadas", async () => {
    const r = await repositorio([borrador("a"), { ...borrador("b"), sucursalId: "usulutan" }], {
      asignadas: ["matriz"],
    }).ejecutar("u", "e", ["a", "b"]);
    expect(r.contabilizadas.map((x) => x.id)).toEqual(["a"]);
    expect(r.rechazadas).toEqual([
      { id: "b", motivo: "sucursal_no_autorizada", mensaje: "No tiene acceso a la sucursal de la partida." },
    ]);
  });

  it("si la base rechaza una partida, sigue con las demás sin saltar números", async () => {
    const caso = repositorio([borrador("a"), borrador("b"), borrador("c")], { rechaza: ["b"] });
    expect(await caso.ejecutar("u", "e", ["a", "b", "c"])).toEqual({
      contabilizadas: [
        { id: "a", numero: 1, ambito: "2026" },
        { id: "c", numero: 2, ambito: "2026" },
      ],
      rechazadas: [{ id: "b", motivo: "regla_contable", mensaje: "El período de 11/2026 está cerrado" }],
    });
  });

  it("sin el permiso no contabiliza nada", async () => {
    await expect(repositorio([borrador("a")], { puede: false }).ejecutar("u", "e", ["a"])).rejects.toThrow(
      SinPermisoError,
    );
  });

  it("explica por qué no se contabiliza cada borrador", async () => {
    const inactiva = { ...borrador("inactiva"), cuentas: [{ ...CAJA, activa: false }, VENTAS] };
    const unaLinea = { ...borrador("una"), lineas: [{ cuentaId: "caja", debe: "0", haber: "0" }] };
    const r = await repositorio([inactiva, unaLinea, borrador("cero", "0", "0")]).ejecutar("u", "e", [
      "inactiva",
      "una",
      "cero",
    ]);
    expect(r.rechazadas.map((x) => x.mensaje)).toEqual([
      "Línea 1: La cuenta está inactiva.",
      "Línea 1: La línea no tiene monto en el debe ni en el haber.",
      "Línea 1: La línea no tiene monto en el debe ni en el haber.",
    ]);
  });
});
