import type { CrearEmpresa, EmpresaDetalle } from "@contable/shared";
import { describe, expect, it } from "vitest";
import { EmpresaNoEncontradaError, ReglaEmpresaError, SinPermisoError } from "../domain/empresa.js";
import type { RepositorioEmpresas, UnidadEmpresas } from "../domain/repositorio-empresas.js";
import { ConsultarEmpresa, EditarEmpresaCaso, RegistrarEmpresa } from "./casos-empresa.js";

const DATOS: CrearEmpresa = {
  nombre: "Comercial Oriente, S.A. de C.V.",
  nit: "0614-010190-101-5",
  tipoContribuyente: "sociedad",
  clasificacion: "otro",
  modoNumeracion: "anual",
};

const empresa = (cambios: Partial<EmpresaDetalle> = {}): EmpresaDetalle => ({
  id: "empresa-1",
  nombre: DATOS.nombre,
  nombreComercial: null,
  nit: DATOS.nit,
  nrc: null,
  tipoContribuyente: "sociedad",
  clasificacion: "otro",
  actividadEconomica: null,
  direccion: null,
  telefono: null,
  correo: null,
  logoUrl: null,
  modoNumeracion: "anual",
  activa: true,
  creadoEn: "2026-11-13T00:00:00.000Z",
  actualizadoEn: "2026-11-13T00:00:00.000Z",
  ...cambios,
});

/** Repositorio en memoria que anota cada operación en orden. */
function repositorio(opciones: { permisos?: string[] | null; contabilizadas?: boolean } = {}) {
  const operaciones: string[] = [];
  const unidad: UnidadEmpresas = {
    asegurarUsuario: async (u) => void operaciones.push(`asegurarUsuario:${u.id}`),
    crear: async () => (operaciones.push("crear"), empresa()),
    copiarCatalogoBase: async (e) => (operaciones.push(`catalogo:${e}`), 165),
    asignarAdministrador: async (u, e) => void operaciones.push(`administrador:${u}:${e}`),
    obtener: async () => empresa(),
    permisos: async () =>
      opciones.permisos === null ? null : new Set(opciones.permisos ?? ["empresa.ver", "empresa.configurar"]),
    tienePartidasContabilizadas: async () => opciones.contabilizadas ?? false,
    actualizar: async (_e, cambios) => (
      operaciones.push("actualizar"),
      empresa(cambios as Partial<EmpresaDetalle>)
    ),
  };
  const repo: RepositorioEmpresas = {
    enTransaccion: async (usuarioId, fn) => {
      operaciones.push(`transaccion:${usuarioId}`);
      return fn(unidad);
    },
  };
  return { repo, operaciones };
}

describe("RegistrarEmpresa", () => {
  it("registra la empresa, copia su catálogo y deja al creador como administrador, en una transacción", async () => {
    const { repo, operaciones } = repositorio();
    const r = await new RegistrarEmpresa(repo).ejecutar({ id: "ana", email: "ana@ejemplo.com" }, DATOS);

    expect(r.id).toBe("empresa-1");
    expect(operaciones).toEqual([
      "transaccion:ana",
      "asegurarUsuario:ana",
      "crear",
      "catalogo:empresa-1",
      "administrador:ana:empresa-1",
    ]);
  });
});

describe("ConsultarEmpresa", () => {
  it("responde como no encontrada si el usuario no pertenece a la empresa", async () => {
    const { repo } = repositorio({ permisos: null });
    await expect(new ConsultarEmpresa(repo).ejecutar("ana", "empresa-1")).rejects.toBeInstanceOf(
      EmpresaNoEncontradaError,
    );
  });
});

describe("EditarEmpresaCaso", () => {
  it("aplica los cambios si el rol tiene empresa.configurar", async () => {
    const { repo, operaciones } = repositorio();
    const r = await new EditarEmpresaCaso(repo).ejecutar("ana", "empresa-1", { telefono: "2661-0000" });
    expect(r.telefono).toBe("2661-0000");
    expect(operaciones).toContain("actualizar");
  });

  it("exige el permiso empresa.configurar", async () => {
    const { repo, operaciones } = repositorio({ permisos: ["empresa.ver"] });
    await expect(
      new EditarEmpresaCaso(repo).ejecutar("ana", "empresa-1", { telefono: "1" }),
    ).rejects.toBeInstanceOf(SinPermisoError);
    expect(operaciones).not.toContain("actualizar");
  });

  it("no acepta un DUI como NIT de una sociedad", async () => {
    const { repo } = repositorio();
    await expect(
      new EditarEmpresaCaso(repo).ejecutar("ana", "empresa-1", { nit: "12345678-4" }),
    ).rejects.toBeInstanceOf(ReglaEmpresaError);
  });

  it("no cambia la numeración si ya hay partidas contabilizadas, pero sí si no cambia de modo", async () => {
    const { repo } = repositorio({ contabilizadas: true });
    const caso = new EditarEmpresaCaso(repo);
    await expect(caso.ejecutar("ana", "empresa-1", { modoNumeracion: "mensual" })).rejects.toThrow(
      /numeración/,
    );
    await expect(caso.ejecutar("ana", "empresa-1", { modoNumeracion: "anual" })).resolves.toMatchObject({
      modoNumeracion: "anual",
    });
  });

  it("sin partidas contabilizadas la numeración se puede cambiar", async () => {
    const { repo } = repositorio({ contabilizadas: false });
    await expect(
      new EditarEmpresaCaso(repo).ejecutar("ana", "empresa-1", { modoNumeracion: "mensual" }),
    ).resolves.toMatchObject({ modoNumeracion: "mensual" });
  });
});
