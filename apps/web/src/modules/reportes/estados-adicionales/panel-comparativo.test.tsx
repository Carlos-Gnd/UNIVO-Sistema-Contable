import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { EstadoComparativo } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { documentoComparativo, textoPorcentaje } from "./documento-comparativo";
import { PantallaEstadosAdicionales } from "./pantalla-estados-adicionales";

const E = "e1";
const COMPARATIVO = `GET /empresas/${E}/estados/comparativo`;
const BASE = {
  [`GET /empresas/${E}/sucursales`]: { cuerpo: [] },
  [`GET /empresas/${E}`]: {
    cuerpo: {
      id: E,
      nombre: "CheroPhonex",
      nombreComercial: null,
      nit: "0614-010190-101-5",
      logoUrl: null,
      representanteLegal: null,
      contadorNombre: null,
      contadorRegistro: null,
    },
  },
  // La pestaña de patrimonio es la primera: se abre sola
  [`GET /empresas/${E}/estados/cambios-patrimonio`]: { estado: 404, cuerpo: {} },
};

const comparativo = (extra: Partial<EstadoComparativo> = {}): EstadoComparativo => ({
  estado: "resultados",
  formato: "clase",
  titulo: "Estado de resultados",
  sucursalId: null,
  periodoA: { desde: "2026-10-01", hasta: "2026-10-31" },
  periodoB: { desde: "2026-09-01", hasta: "2026-09-30" },
  filas: [
    { id: "ventas", texto: "Ventas", codigo: "", tipo: "seccion" },
    {
      id: "ventas:5101",
      texto: "Ventas netas",
      codigo: "5101",
      tipo: "renglon",
      periodoA: "1200.00",
      periodoB: "1000.00",
      variacion: "200.00",
      porcentaje: "20.00",
    },
    {
      id: "ventas:total",
      texto: "Total ventas",
      codigo: "",
      tipo: "total",
      periodoA: "1200.00",
      periodoB: "1000.00",
      variacion: "200.00",
      porcentaje: "20.00",
    },
    {
      id: "utilidadNeta",
      texto: "Pérdida neta",
      codigo: "",
      tipo: "resultado",
      periodoA: "-50.00",
      periodoB: "0.00",
      variacion: "-50.00",
      porcentaje: null,
    },
  ],
  ...extra,
});

const abrir = () =>
  renderizar(<PantallaEstadosAdicionales parametros={{ empresaId: E }} />, {
    permisos: ["estados.ver"] as never,
  });

describe("estados comparativos (S3-T29, HU-43)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("compara el mes en curso con el anterior y muestra montos, variación y porcentaje", async () => {
    const peticiones = simularApi({ ...BASE, [COMPARATIVO]: { cuerpo: comparativo() } });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("tab", { name: "Comparativos" }));

    const tabla = await screen.findByRole("table");
    expect(
      within(tabla)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
    ).toEqual([
      "Concepto",
      "01/10/2026 al 31/10/2026",
      "01/09/2026 al 30/09/2026",
      "Variación US$",
      "Variación %",
    ]);
    expect(
      within(tabla)
        .getAllByRole("row")
        .slice(1)
        .map((f) => f.textContent),
    ).toEqual([
      "Ventas",
      "5101 · Ventas netas1,200.001,000.00200.0020.00 %",
      "Total ventas1,200.001,000.00200.0020.00 %",
      "Pérdida neta(50.00)0.00(50.00)n/a",
    ]);
    expect(Object.fromEntries(peticiones.find((p) => p.ruta.endsWith("/comparativo"))!.consulta)).toEqual({
      estado: "resultados",
      desdeA: "2026-10-01",
      hastaA: "2026-10-31",
      desdeB: "2026-09-01",
      hastaB: "2026-09-30",
    });
    expect(screen.getByText(/«n\/a» indica que el período B está en cero/)).toBeInTheDocument();
  });

  it("el balance general compara dos fechas y no envía fechas iniciales", async () => {
    const peticiones = simularApi({
      ...BASE,
      [COMPARATIVO]: ({ consulta }) => ({
        cuerpo:
          consulta.get("estado") === "balance-general"
            ? comparativo({
                estado: "balance-general",
                titulo: "Balance general",
                periodoA: { desde: null, hasta: "2026-10-31" },
                periodoB: { desde: null, hasta: "2026-09-30" },
              })
            : comparativo(),
      }),
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("tab", { name: "Comparativos" }));
    await screen.findByRole("table");

    await usuario.selectOptions(screen.getByLabelText("Estado"), "balance-general");
    await waitFor(() =>
      expect(peticiones.some((p) => p.consulta.get("estado") === "balance-general")).toBe(true),
    );
    const consulta = peticiones.findLast((p) => p.consulta.get("estado") === "balance-general")!.consulta;
    expect(consulta.has("desdeA")).toBe(false);
    expect(consulta.has("desdeB")).toBe(false);
    expect(screen.queryByLabelText(/Período A: Desde/)).not.toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "Al 31/10/2026" })).toBeInTheDocument();
  });

  it("no consulta con un rango invertido y avisa", async () => {
    const peticiones = simularApi({ ...BASE, [COMPARATIVO]: { cuerpo: comparativo() } });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("tab", { name: "Comparativos" }));
    await screen.findByRole("table");
    const antes = peticiones.filter((p) => p.ruta.endsWith("/comparativo")).length;

    const desde = screen.getByLabelText("Período A: Desde");
    await usuario.clear(desde);
    await usuario.type(desde, "2026-11-15");

    expect(
      await screen.findByText("La fecha inicial no puede ser posterior a la final."),
    ).toBeInTheDocument();
    expect(peticiones.filter((p) => p.ruta.endsWith("/comparativo"))).toHaveLength(antes);
  });

  it("el documento exportable lleva los dos períodos, la variación y el porcentaje como texto", () => {
    const doc = documentoComparativo(comparativo());
    expect(doc.titulo).toBe("Estado de resultados comparativo");
    expect(doc.columnas.map((c) => [c.titulo, c.tipo])).toEqual([
      ["01/10/2026 al 31/10/2026", "dinero"],
      ["01/09/2026 al 30/09/2026", "dinero"],
      ["Variación US$", "dinero"],
      ["Variación %", "texto"],
    ]);
    expect(doc.filas.find((f) => f.id === "ventas:5101")).toMatchObject({
      texto: "5101 · Ventas netas",
      valores: ["1200.00", "1000.00", "200.00", "20.00 %"],
    });
    expect(doc.filas.at(-1)?.valores?.at(-1)).toBe("n/a");
    expect(textoPorcentaje(null)).toBe("n/a");
  });
});
