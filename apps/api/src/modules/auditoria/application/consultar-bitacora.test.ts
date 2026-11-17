import { filtrosBitacoraSchema, moduloDeTabla, type EntradaBitacora } from "@contable/shared";
import { describe, expect, it } from "vitest";
import {
  EmpresaNoEncontradaError,
  inicioDelDiaSiguiente,
  SinPermisoBitacoraError,
  type AlcanceSucursales,
  type CriteriosBitacora,
  type RepositorioBitacora,
} from "../domain/bitacora.js";
import { ConsultarBitacora } from "./consultar-bitacora.js";

/** Repositorio en memoria que guarda los criterios con que se consultó. */
function repositorio(
  permisos: string[] | null = ["bitacora.ver"],
  total = 0,
  alcance: AlcanceSucursales = { todas: true, asignadas: [] },
) {
  const consultas: CriteriosBitacora[] = [];
  const repo: RepositorioBitacora = {
    permisos: async () => (permisos ? new Set(permisos) : null),
    accesoSucursales: async () => alcance,
    buscar: async (c) => {
      consultas.push(c);
      return { registros: [] as EntradaBitacora[], total };
    },
  };
  return { repo, consultas };
}

const filtros = (entrada: Record<string, unknown> = {}) => filtrosBitacoraSchema.parse(entrada);

describe("ConsultarBitacora", () => {
  it("traduce el módulo a sus tablas y las fechas a instantes de El Salvador", async () => {
    const { repo, consultas } = repositorio();
    await new ConsultarBitacora(repo).ejecutar(
      "ana",
      "empresa-1",
      filtros({ modulo: "contabilidad", accion: "UPDATE", desde: "2026-11-01", hasta: "2026-11-13" }),
    );
    expect(consultas[0]).toMatchObject({
      empresaId: "empresa-1",
      tablas: ["ejercicios", "periodos", "partidas", "partida_detalles"],
      accion: "UPDATE",
      // 00:00 en El Salvador (UTC-6) son las 06:00 UTC; «hasta» incluye el día completo
      desde: new Date("2026-11-01T06:00:00.000Z"),
      antesDe: new Date("2026-11-14T06:00:00.000Z"),
    });
  });

  it("calcula la página que se salta y el número de páginas", async () => {
    const { repo, consultas } = repositorio(["bitacora.ver"], 51);
    const r = await new ConsultarBitacora(repo).ejecutar(
      "ana",
      "e",
      filtros({ pagina: "3", porPagina: "25" }),
    );
    expect(consultas[0]).toMatchObject({ saltar: 50, tomar: 25 });
    expect(r).toMatchObject({ total: 51, pagina: 3, porPagina: 25, paginas: 3 });
  });

  it("sin filtros no restringe usuario, módulo, acción ni fechas", async () => {
    const { repo, consultas } = repositorio();
    await new ConsultarBitacora(repo).ejecutar("ana", "e", filtros());
    expect(consultas[0]).toEqual({ empresaId: "e", sucursalesAsignadas: null, saltar: 0, tomar: 25 });
  });

  it("limita a las sucursales asignadas a quien no las ve todas (auxiliar y consulta)", async () => {
    const { repo, consultas } = repositorio(["bitacora.ver"], 0, { todas: false, asignadas: ["matriz"] });
    await new ConsultarBitacora(repo).ejecutar("dora", "e", filtros());
    expect(consultas[0]?.sucursalesAsignadas).toEqual(["matriz"]);
  });

  it("exige bitacora.ver y pertenecer a la empresa", async () => {
    await expect(
      new ConsultarBitacora(repositorio(["empresa.ver"]).repo).ejecutar("ana", "e", filtros()),
    ).rejects.toBeInstanceOf(SinPermisoBitacoraError);
    await expect(
      new ConsultarBitacora(repositorio(null).repo).ejecutar("ana", "e", filtros()),
    ).rejects.toBeInstanceOf(EmpresaNoEncontradaError);
  });
});

describe("filtros y módulos", () => {
  it("el fin de mes y de año pasa al día siguiente correcto", () => {
    expect(inicioDelDiaSiguiente("2026-12-31").toISOString()).toBe("2027-01-01T06:00:00.000Z");
    expect(inicioDelDiaSiguiente("2028-02-28").toISOString()).toBe("2028-02-29T06:00:00.000Z");
  });

  it("valida los filtros", () => {
    expect(filtrosBitacoraSchema.safeParse({ desde: "2026-11-13", hasta: "2026-11-01" }).success).toBe(false);
    expect(filtrosBitacoraSchema.safeParse({ porPagina: "500" }).success).toBe(false);
    expect(filtrosBitacoraSchema.safeParse({ pagina: "0" }).success).toBe(false);
    expect(filtrosBitacoraSchema.safeParse({ modulo: "planilla" }).success).toBe(false);
    expect(filtrosBitacoraSchema.safeParse({ accion: "TRUNCATE" }).success).toBe(false);
    expect(filtrosBitacoraSchema.safeParse({ usuarioId: "ana" }).success).toBe(false);
    expect(filtrosBitacoraSchema.safeParse({ orden: "asc" }).success).toBe(false);
  });

  it("cada tabla con trigger de bitácora y empresa pertenece a un módulo", () => {
    for (const tabla of [
      "empresas",
      "sucursales",
      "membresias",
      "membresia_sucursales",
      "cuentas",
      "ejercicios",
      "periodos",
      "partidas",
      "partida_detalles",
    ]) {
      expect(moduloDeTabla(tabla), tabla).not.toBeNull();
    }
    expect(moduloDeTabla("bitacora")).toBeNull();
  });
});
