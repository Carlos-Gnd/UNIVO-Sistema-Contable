import type { CrearEmpresa } from "@contable/shared";
import { describe, expect, it } from "vitest";
import { EmpresaNoEncontradaError, ReglaEmpresaError, SinPermisoError } from "../domain/empresa.js";
import { ConsultarEmpresa, EditarEmpresaCaso, RegistrarEmpresa } from "./casos-empresa.js";
import { repositorioEnMemoria as repositorio } from "./repositorio-en-memoria.js";

const DATOS: CrearEmpresa = {
  nombre: "Comercial Oriente, S.A. de C.V.",
  nit: "0614-010190-101-5",
  tipoContribuyente: "sociedad",
  clasificacion: "otro",
  modoNumeracion: "anual",
  direccion: "Av. Roosevelt Sur, San Miguel",
  casaMatriz: { nombre: "Casa matriz", codigoEstablecimiento: "M001", codigoPuntoVenta: "P001" },
};

describe("RegistrarEmpresa", () => {
  it("registra la empresa con su casa matriz y deja al creador como administrador, en una transacción", async () => {
    const { repo, operaciones } = repositorio({ sucursales: [] });
    const r = await new RegistrarEmpresa(repo).ejecutar({ id: "ana", email: "ana@ejemplo.com" }, DATOS);

    expect(r.id).toBe("empresa-1");
    expect(operaciones).toEqual([
      "transaccion:ana",
      "asegurarUsuario:ana",
      "crear",
      "sucursal:M001:matriz",
      "administrador:ana:empresa-1",
    ]);
  });

  it("la casa matriz toma la dirección de la empresa si no trae una propia (S1-T44)", async () => {
    const { repo, sucursales } = repositorio({ sucursales: [] });
    await new RegistrarEmpresa(repo).ejecutar({ id: "ana" }, DATOS);
    expect(sucursales).toEqual([
      expect.objectContaining({
        esMatriz: true,
        codigoEstablecimiento: "M001",
        codigoPuntoVenta: "P001",
        direccion: "Av. Roosevelt Sur, San Miguel",
      }),
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
