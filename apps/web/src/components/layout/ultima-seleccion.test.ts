import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardarUltimaSeleccion, leerUltimaSeleccion } from "./ultima-seleccion";

const CLAVE = "contable:ultima-seleccion";

describe("última selección", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("lee solo identificadores con el tipo esperado", () => {
    localStorage.setItem(CLAVE, JSON.stringify({ empresaId: "empresa-1", sucursalId: "sucursal-1" }));
    expect(leerUltimaSeleccion()).toEqual({ empresaId: "empresa-1", sucursalId: "sucursal-1" });
  });

  it.each([
    "no es json",
    "[]",
    "{}",
    JSON.stringify({ empresaId: 12, sucursalId: "s1" }),
    JSON.stringify({ empresaId: "e1", sucursalId: 12 }),
    JSON.stringify({ empresaId: "", sucursalId: null }),
  ])("ignora los datos dañados o de tipo inválido: %s", (valor) => {
    localStorage.setItem(CLAVE, valor);
    expect(leerUltimaSeleccion()).toBeNull();
  });

  it("no falla si localStorage rechaza la lectura o escritura", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Almacenamiento bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Almacenamiento bloqueado", "SecurityError");
    });

    expect(leerUltimaSeleccion()).toBeNull();
    expect(() => guardarUltimaSeleccion({ empresaId: "e1", sucursalId: "s1" })).not.toThrow();
  });
});
