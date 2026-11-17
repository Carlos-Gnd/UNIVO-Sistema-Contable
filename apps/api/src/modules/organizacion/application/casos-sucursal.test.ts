import { describe, expect, it } from "vitest";
import { ReglaEmpresaError, SinPermisoError, SucursalNoEncontradaError } from "../domain/empresa.js";
import { EditarSucursalCaso, ListarSucursales, RegistrarSucursal } from "./casos-sucursal.js";
import { repositorioEnMemoria, sucursalDePrueba } from "./repositorio-en-memoria.js";

const MATRIZ = sucursalDePrueba();
const SUR = sucursalDePrueba({
  id: "sur",
  nombre: "Sucursal Usulután",
  codigoEstablecimiento: "0002",
  esMatriz: false,
});

describe("ListarSucursales", () => {
  it("devuelve todas si el usuario tiene acceso a todas", async () => {
    const { repo } = repositorioEnMemoria({ sucursales: [MATRIZ, SUR] });
    expect(await new ListarSucursales(repo).ejecutar("ana", "empresa-1")).toHaveLength(2);
  });

  it("con sucursales asignadas, solo devuelve esas", async () => {
    const { repo } = repositorioEnMemoria({ sucursales: [MATRIZ, SUR], asignadas: ["sur"] });
    expect(await new ListarSucursales(repo).ejecutar("ana", "empresa-1")).toEqual([SUR]);
  });

  it("exige sucursales.ver", async () => {
    const { repo } = repositorioEnMemoria({ permisos: ["empresa.ver"] });
    await expect(new ListarSucursales(repo).ejecutar("ana", "empresa-1")).rejects.toBeInstanceOf(
      SinPermisoError,
    );
  });
});

describe("RegistrarSucursal", () => {
  it("crea una sucursal que nunca es matriz", async () => {
    const { repo } = repositorioEnMemoria();
    const s = await new RegistrarSucursal(repo).ejecutar("ana", "empresa-1", {
      nombre: "Sucursal Usulután",
      codigoEstablecimiento: "0002",
      codigoPuntoVenta: "0001",
    });
    expect(s).toMatchObject({ esMatriz: false, codigoEstablecimiento: "0002" });
  });

  it("exige sucursales.gestionar", async () => {
    const { repo, operaciones } = repositorioEnMemoria({ permisos: ["empresa.ver", "sucursales.ver"] });
    await expect(
      new RegistrarSucursal(repo).ejecutar("ana", "empresa-1", {
        nombre: "X",
        codigoEstablecimiento: "0003",
        codigoPuntoVenta: "0001",
      }),
    ).rejects.toBeInstanceOf(SinPermisoError);
    expect(operaciones.some((o) => o.startsWith("sucursal:"))).toBe(false);
  });
});

describe("alcance por sucursal", () => {
  it("quien solo tiene algunas sucursales no crea otras", async () => {
    const { repo, operaciones } = repositorioEnMemoria({ asignadas: ["matriz"] });
    await expect(
      new RegistrarSucursal(repo).ejecutar("ana", "empresa-1", {
        nombre: "Sucursal Usulután",
        codigoEstablecimiento: "0002",
        codigoPuntoVenta: "0001",
      }),
    ).rejects.toBeInstanceOf(SinPermisoError);
    expect(operaciones.some((o) => o.startsWith("sucursal:"))).toBe(false);
  });

  it("solo edita las sucursales asignadas; una ajena responde como no encontrada", async () => {
    const { repo, operaciones } = repositorioEnMemoria({ sucursales: [MATRIZ, SUR], asignadas: ["matriz"] });
    await expect(
      new EditarSucursalCaso(repo).ejecutar("ana", "empresa-1", "sur", { activa: false }),
    ).rejects.toBeInstanceOf(SucursalNoEncontradaError);
    expect(operaciones).not.toContain("actualizarSucursal:sur");
    await expect(
      new EditarSucursalCaso(repo).ejecutar("ana", "empresa-1", "matriz", { nombre: "Matriz San Miguel" }),
    ).resolves.toMatchObject({ nombre: "Matriz San Miguel" });
  });
});

describe("EditarSucursalCaso", () => {
  const editar = (opciones: Parameters<typeof repositorioEnMemoria>[0] = {}) => {
    const r = repositorioEnMemoria({ sucursales: [MATRIZ, SUR], ...opciones });
    return { ...r, caso: new EditarSucursalCaso(r.repo) };
  };

  it("inactiva y reactiva una sucursal", async () => {
    const { caso } = editar({ conMovimientos: ["sur"] });
    expect(await caso.ejecutar("ana", "empresa-1", "sur", { activa: false })).toMatchObject({
      activa: false,
    });
    expect(await caso.ejecutar("ana", "empresa-1", "sur", { activa: true })).toMatchObject({ activa: true });
  });

  it("no inactiva la casa matriz", async () => {
    const { caso, operaciones } = editar();
    await expect(caso.ejecutar("ana", "empresa-1", "matriz", { activa: false })).rejects.toThrow(
      /casa matriz no se puede inactivar/,
    );
    expect(operaciones).not.toContain("actualizarSucursal:matriz");
  });

  it("con movimientos no cambia los códigos de Hacienda, pero sí el nombre", async () => {
    const { caso } = editar({ conMovimientos: ["sur"] });
    await expect(
      caso.ejecutar("ana", "empresa-1", "sur", { codigoEstablecimiento: "0009" }),
    ).rejects.toBeInstanceOf(ReglaEmpresaError);
    await expect(
      caso.ejecutar("ana", "empresa-1", "sur", { codigoPuntoVenta: "0002" }),
    ).rejects.toBeInstanceOf(ReglaEmpresaError);
    await expect(
      caso.ejecutar("ana", "empresa-1", "sur", { nombre: "Usulután centro" }),
    ).resolves.toMatchObject({
      nombre: "Usulután centro",
    });
    // Reenviar el mismo código no es un cambio
    await expect(
      caso.ejecutar("ana", "empresa-1", "sur", { codigoEstablecimiento: "0002" }),
    ).resolves.toBeDefined();
  });

  it("sin movimientos los códigos se pueden corregir", async () => {
    const { caso } = editar();
    await expect(
      caso.ejecutar("ana", "empresa-1", "sur", { codigoEstablecimiento: "S001" }),
    ).resolves.toMatchObject({ codigoEstablecimiento: "S001" });
  });

  it("responde no encontrada si la sucursal no es de la empresa", async () => {
    const { caso } = editar();
    await expect(caso.ejecutar("ana", "empresa-1", "otra", { nombre: "X" })).rejects.toBeInstanceOf(
      SucursalNoEncontradaError,
    );
  });
});
