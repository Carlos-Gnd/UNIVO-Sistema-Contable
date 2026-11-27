import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import type { PartidaVersionVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { HistorialVersiones } from "./historial-versiones";
import type { LineaPartidaVista, PartidaVista } from "./tipos";

const E = "e1";
const linea = (cuentaId: string, nombre: string, debe: string, haber: string): LineaPartidaVista => ({
  cuentaId,
  codigo: cuentaId,
  nombre,
  debe,
  haber,
  concepto: null,
});

const partida = (lineas: LineaPartidaVista[], extra: Partial<PartidaVista> = {}): PartidaVista => ({
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
  totalDebe: lineas.reduce((t, l) => t + Number(l.debe), 0).toFixed(2),
  totalHaber: lineas.reduce((t, l) => t + Number(l.haber), 0).toFixed(2),
  diferencia: "0.00",
  cuadra: true,
  creadoEn: "2026-11-09T10:00:00.000Z",
  actualizadoEn: "2026-11-12T09:00:00.000Z",
  ...extra,
});

const ORIGINAL = [linea("5101", "Energía", "85.40", "0.00"), linea("1101", "Caja", "0.00", "85.40")];
const VIGENTE = [linea("5102", "Agua", "90.00", "0.00"), linea("1101", "Caja", "0.00", "90.00")];
const VERSION_1: PartidaVersionVista = {
  version: 1,
  reemplazadaEn: "2026-11-12T09:00:00.000Z",
  reemplazadaPor: "u1",
  partida: partida(ORIGINAL),
};

const abrir = () =>
  renderizar(<HistorialVersiones empresaId={E} partida={partida(VIGENTE)} />, {
    permisos: ["partidas.ver"],
  });

describe("historial de versiones (S2-T09, HU-23)", () => {
  it("lista las versiones y marca lo que cambió respecto a la anterior", async () => {
    simularApi({ [`GET /empresas/${E}/partidas/p1/versiones`]: { cuerpo: [VERSION_1] } });
    abrir();

    const lista = await screen.findByRole("list", { name: "Historial de versiones" });
    const versiones = within(lista).getAllByRole("listitem");
    expect(versiones[0]).toHaveTextContent("Versión 2Vigente");
    expect(versiones[1]).toHaveTextContent("Versión 1Anterior");
    expect(screen.getByText("Se marcan los cambios respecto a la versión 1.")).toBeInTheDocument();

    const filas = screen.getAllByRole("row");
    expect(filas.find((f) => f.textContent?.includes("Agua"))).toHaveTextContent("Nueva");
    expect(filas.find((f) => f.textContent?.includes("Caja"))).toHaveTextContent("Cambió");
    expect(filas.find((f) => f.textContent?.includes("Energía"))).toHaveTextContent("Quitada");
  });

  it("muestra una versión anterior en solo lectura y permite volver a la vigente", async () => {
    simularApi({ [`GET /empresas/${E}/partidas/p1/versiones`]: { cuerpo: [VERSION_1] } });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: /Versión 1/ }));
    expect(screen.getByRole("heading", { name: "Líneas de la versión 1" })).toBeInTheDocument();
    expect(screen.getByText("Versión anterior, solo lectura.")).toBeInTheDocument();
    expect(screen.getByText("Energía")).toBeInTheDocument();
    expect(screen.queryByText("Agua")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Ver la vigente" }));
    expect(screen.getByRole("heading", { name: "Líneas de la partida" })).toBeInTheDocument();
  });

  it("indica que la partida no se ha editado cuando no hay versiones anteriores", async () => {
    simularApi({ [`GET /empresas/${E}/partidas/p1/versiones`]: { cuerpo: [] } });
    abrir();

    expect(
      await screen.findByText("Esta partida no se ha editado desde que se contabilizó."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("avisa si no se pudo cargar el historial", async () => {
    simularApi({ [`GET /empresas/${E}/partidas/p1/versiones`]: { estado: 500, cuerpo: {} } });
    abrir();

    expect(await screen.findByText("No se pudo cargar el historial de versiones.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
