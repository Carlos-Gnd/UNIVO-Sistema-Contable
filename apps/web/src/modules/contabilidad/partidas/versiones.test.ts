import { describe, expect, it } from "vitest";
import type { PartidaVersionVista } from "@contable/shared";
import type { LineaPartidaVista, PartidaVista } from "./tipos";
import { armarVersiones, compararLineas } from "./versiones";

const linea = (cuentaId: string, debe: string, haber: string): LineaPartidaVista => ({
  cuentaId,
  codigo: cuentaId.toUpperCase(),
  nombre: `Cuenta ${cuentaId}`,
  debe,
  haber,
  concepto: null,
});

const partida = (lineas: LineaPartidaVista[], actualizadoEn: string): PartidaVista => ({
  id: "p1",
  sucursalId: "s1",
  fecha: "2026-11-09",
  tipo: "operacion",
  estado: "contabilizada",
  numero: 7,
  concepto: null,
  documentoTipo: null,
  documentoNumero: null,
  origen: "manual",
  lineas,
  explicacionDidactica: null,
  totalDebe: "0.00",
  totalHaber: "0.00",
  diferencia: "0.00",
  cuadra: true,
  creadoEn: "2026-11-09T10:00:00.000Z",
  actualizadoEn,
});

const anterior = (
  version: number,
  reemplazadaEn: string,
  lineas: LineaPartidaVista[],
): PartidaVersionVista => ({
  version,
  reemplazadaEn,
  reemplazadaPor: "u1",
  partida: partida(lineas, "2026-11-09T10:00:00.000Z"),
});

describe("armarVersiones", () => {
  it("sin ediciones solo existe la versión 1, vigente", () => {
    const [v, ...resto] = armarVersiones(partida([], "2026-11-09T10:00:00.000Z"), []);
    expect(resto).toEqual([]);
    expect(v).toMatchObject({ numero: 1, vigente: true, fecha: "2026-11-09T10:00:00.000Z" });
  });

  it("ordena de la más reciente a la más antigua y numera la vigente como N+1", () => {
    const versiones = armarVersiones(partida([], "2026-11-12T09:00:00.000Z"), [
      anterior(2, "2026-11-12T09:00:00.000Z", []),
      anterior(1, "2026-11-10T09:00:00.000Z", []),
    ]);
    expect(versiones.map((v) => [v.numero, v.vigente])).toEqual([
      [3, true],
      [2, false],
      [1, false],
    ]);
    // Cada versión nace cuando la anterior fue reemplazada; la primera, al crearse la partida
    expect(versiones.map((v) => v.fecha)).toEqual([
      "2026-11-12T09:00:00.000Z",
      "2026-11-10T09:00:00.000Z",
      "2026-11-09T10:00:00.000Z",
    ]);
  });
});

describe("compararLineas", () => {
  it("sin versión previa no marca nada", () => {
    expect(compararLineas([linea("a", "10.00", "0.00")], undefined).map((l) => l.marca)).toEqual(["igual"]);
  });

  it("marca líneas nuevas, cambiadas, iguales y quitadas por cuenta", () => {
    const previas = [linea("a", "10.00", "0.00"), linea("b", "0.00", "10.00"), linea("c", "5.00", "0.00")];
    const actuales = [linea("a", "10", "0.00"), linea("b", "0.00", "12.00"), linea("d", "2.00", "0.00")];
    expect(compararLineas(actuales, previas).map((l) => [l.cuentaId, l.marca])).toEqual([
      ["a", "igual"],
      ["b", "cambio"],
      ["d", "nueva"],
      ["c", "quitada"],
    ]);
  });

  it("empareja una cuenta repetida con su homóloga y no con la primera", () => {
    const previas = [linea("a", "10.00", "0.00"), linea("a", "5.00", "0.00")];
    const actuales = [linea("a", "10.00", "0.00"), linea("a", "7.00", "0.00")];
    expect(compararLineas(actuales, previas).map((l) => [l.cuentaId, l.aparicion, l.marca])).toEqual([
      ["a", 1, "igual"],
      ["a", 2, "cambio"],
    ]);
  });

  it("marca como nueva o quitada la aparición que sobra de una cuenta repetida", () => {
    const una = [linea("a", "10.00", "0.00")];
    const dos = [linea("a", "10.00", "0.00"), linea("a", "3.00", "0.00")];
    expect(compararLineas(dos, una).map((l) => l.marca)).toEqual(["igual", "nueva"]);
    expect(compararLineas(una, dos).map((l) => [l.aparicion, l.marca])).toEqual([
      [1, "igual"],
      [2, "quitada"],
    ]);
  });
});
