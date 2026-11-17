import { describe, expect, it } from "vitest";
import { coincidir, resolverRuta, type DefinicionRuta } from "./rutas";

const Vacio = () => null;
const ruta = (patron: string): DefinicionRuta => ({ patron, componente: Vacio });

describe("rutas de los módulos", () => {
  it("extrae los parámetros de la ruta", () => {
    expect(coincidir("/empresas/:empresaId/sucursales", "/empresas/abc/sucursales")).toEqual({
      empresaId: "abc",
    });
    expect(coincidir("/empresas/:empresaId/sucursales/", "/empresas/abc/sucursales")).toEqual({
      empresaId: "abc",
    });
  });

  it("no coincide con otra cantidad de segmentos o un segmento fijo distinto", () => {
    expect(coincidir("/empresas/:empresaId", "/empresas/abc/sucursales")).toBeNull();
    expect(coincidir("/empresas/:empresaId/sucursales", "/empresas/abc/periodos")).toBeNull();
  });

  it("rechaza parámetros mal codificados", () => {
    expect(coincidir("/empresas/:empresaId", "/empresas/%E0%A4%A")).toBeNull();
  });

  it("prefiere la ruta con más segmentos fijos", () => {
    const rutas = [
      ruta("/empresas/:empresaId/partidas/:partidaId"),
      ruta("/empresas/:empresaId/partidas/nueva"),
    ];
    expect(resolverRuta("/empresas/e1/partidas/nueva", rutas)?.definicion.patron).toBe(
      "/empresas/:empresaId/partidas/nueva",
    );
    expect(resolverRuta("/empresas/e1/partidas/p9", rutas)?.parametros).toEqual({
      empresaId: "e1",
      partidaId: "p9",
    });
    expect(resolverRuta("/otra", rutas)).toBeNull();
  });
});
