// Parámetros contables de la empresa (HU-12): casos de uso de S2-T02 y sus pruebas de bloqueo (S2-T04).
import { describe, expect, it } from "vitest";
import { EmpresaNoEncontradaError, ReglaEmpresaError, SinPermisoError } from "../domain/empresa.js";
import { ConsultarParametros, EditarParametrosCaso } from "./casos-parametros.js";
import { repositorioEnMemoria as repositorio } from "./repositorio-en-memoria.js";

describe("ConsultarParametros", () => {
  it("devuelve los valores, sin bloqueos si la empresa no tiene movimientos", async () => {
    const { repo } = repositorio({ permisos: ["empresa.ver"] });
    expect(await new ConsultarParametros(repo).ejecutar("ana", "empresa-1")).toEqual({
      modoNumeracion: "anual",
      formatoEstados: "clase",
      metodoValuacion: "promedio_ponderado",
      sistemaInventario: "perpetuo",
      tieneMovimientos: false,
      bloqueados: [],
    });
  });

  it("con movimientos indica los parámetros bloqueados (el formato de los estados no)", async () => {
    const { repo } = repositorio({ contabilizadas: true });
    expect(await new ConsultarParametros(repo).ejecutar("ana", "empresa-1")).toMatchObject({
      tieneMovimientos: true,
      bloqueados: ["modoNumeracion", "metodoValuacion", "sistemaInventario"],
    });
  });

  it("responde como no encontrada si el usuario no pertenece a la empresa", async () => {
    const { repo } = repositorio({ permisos: null });
    await expect(new ConsultarParametros(repo).ejecutar("ana", "empresa-1")).rejects.toBeInstanceOf(
      EmpresaNoEncontradaError,
    );
  });
});

describe("EditarParametrosCaso", () => {
  it("sin movimientos cambia todos los parámetros en la transacción del usuario", async () => {
    const { repo, operaciones } = repositorio();
    const r = await new EditarParametrosCaso(repo).ejecutar("ana", "empresa-1", {
      modoNumeracion: "mensual",
      formatoEstados: "niif_pymes",
      metodoValuacion: "peps",
      sistemaInventario: "analitico",
    });
    expect(r).toEqual({
      modoNumeracion: "mensual",
      formatoEstados: "niif_pymes",
      metodoValuacion: "peps",
      sistemaInventario: "analitico",
      tieneMovimientos: false,
      bloqueados: [],
    });
    expect(operaciones).toEqual(["transaccion:ana", "actualizarParametros"]);
  });

  it("exige el permiso empresa.configurar", async () => {
    const { repo, operaciones } = repositorio({ permisos: ["empresa.ver"] });
    await expect(
      new EditarParametrosCaso(repo).ejecutar("ana", "empresa-1", { formatoEstados: "niif_pymes" }),
    ).rejects.toBeInstanceOf(SinPermisoError);
    expect(operaciones).not.toContain("actualizarParametros");
  });

  describe("con partidas contabilizadas (S2-T04)", () => {
    it.each([
      ["modoNumeracion", "mensual", /numeración de partidas/],
      ["metodoValuacion", "peps", /método de valuación/],
      ["sistemaInventario", "analitico", /sistema de inventario/],
    ] as const)("bloquea %s", async (parametro, valor, mensaje) => {
      const { repo, operaciones } = repositorio({ contabilizadas: true });
      const r = new EditarParametrosCaso(repo).ejecutar("ana", "empresa-1", { [parametro]: valor });
      await expect(r).rejects.toBeInstanceOf(ReglaEmpresaError);
      await expect(r).rejects.toThrow(mensaje);
      expect(operaciones).not.toContain("actualizarParametros");
    });

    it("nombra todos los bloqueados que se intentaron cambiar y no aplica ninguno", async () => {
      const { repo, parametros } = repositorio({ contabilizadas: true });
      await expect(
        new EditarParametrosCaso(repo).ejecutar("ana", "empresa-1", {
          formatoEstados: "niif_pymes",
          metodoValuacion: "peps",
          sistemaInventario: "analitico",
        }),
      ).rejects.toThrow(
        "La empresa ya tiene partidas contabilizadas: no se puede cambiar el método de valuación y el sistema de inventario.",
      );
      expect(parametros.formatoEstados).toBe("clase");
    });

    it("deja cambiar el formato de los estados, y reenviar los valores actuales no cuenta como cambio", async () => {
      const { repo } = repositorio({ contabilizadas: true });
      const r = await new EditarParametrosCaso(repo).ejecutar("ana", "empresa-1", {
        formatoEstados: "niif_pymes",
        modoNumeracion: "anual",
        metodoValuacion: "promedio_ponderado",
      });
      expect(r).toMatchObject({
        formatoEstados: "niif_pymes",
        tieneMovimientos: true,
        bloqueados: ["modoNumeracion", "metodoValuacion", "sistemaInventario"],
      });
    });
  });
});
