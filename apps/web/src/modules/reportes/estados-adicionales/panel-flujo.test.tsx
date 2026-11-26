import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { EstadoFlujoEfectivo } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { documentoFlujoEfectivo } from "./documento-flujo";
import { PantallaEstadosAdicionales } from "./pantalla-estados-adicionales";

const E = "e1";
const FLUJO = `GET /empresas/${E}/estados/flujo-efectivo`;
const BASE = {
  [`GET /empresas/${E}/sucursales`]: { cuerpo: [] },
  [`GET /empresas/${E}`]: {
    cuerpo: {
      id: E,
      nombre: "CheroPhonex",
      nombreComercial: null,
      nit: "0614-010190-101-5",
      logoUrl: null,
      representanteLegal: "Carlos Hernández",
      contadorNombre: null,
      contadorRegistro: null,
    },
  },
};

const estado = (extra: Partial<EstadoFlujoEfectivo> = {}): EstadoFlujoEfectivo => ({
  formato: "clase",
  titulo: "Estado de flujo de efectivo",
  desde: "2026-10-01",
  hasta: "2026-10-31",
  sucursalId: null,
  operacion: {
    titulo: "Actividades de operación",
    renglones: [
      { id: "utilidad-neta", concepto: "Utilidad neta del período", monto: "7594.99" },
      {
        id: "depreciacion",
        concepto: "(+) Depreciación, amortización y deterioro del período",
        monto: "104.17",
      },
      { id: "inventarios", concepto: "(−) Aumento de inventarios", monto: "-5888.00" },
    ],
    total: "1811.16",
  },
  inversion: {
    titulo: "Actividades de inversión",
    renglones: [
      {
        id: "activo-fijo",
        concepto: "Compra o venta de propiedad, planta, equipo e intangibles",
        monto: "-2500.00",
      },
    ],
    total: "-2500.00",
  },
  financiamiento: {
    titulo: "Actividades de financiamiento",
    renglones: [
      { id: "aportes", concepto: "Aportes de capital", monto: "22500.00" },
      { id: "retiros", concepto: "Retiros del titular", monto: "-450.00" },
    ],
    total: "22050.00",
  },
  variacionNeta: "21361.16",
  efectivoInicial: "0.00",
  efectivoFinal: "21361.16",
  variacionLibros: "21361.16",
  cuadra: true,
  ...extra,
});

const abrir = () =>
  renderizar(<PantallaEstadosAdicionales parametros={{ empresaId: E }} />, {
    permisos: ["estados.ver"] as never,
  });

async function abrirFlujo(cuerpo: EstadoFlujoEfectivo) {
  const peticiones = simularApi({ ...BASE, [FLUJO]: { cuerpo } });
  const { usuario } = abrir();
  await usuario.click(await screen.findByRole("tab", { name: "Flujo de efectivo" }));
  return { peticiones, usuario };
}

describe("estado de flujo de efectivo (S3-T23, HU-41)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("tiene la pestaña de flujo junto a patrimonio y comparativos", async () => {
    simularApi({ ...BASE });
    abrir();
    const pestanas = await screen.findAllByRole("tab");
    expect(pestanas.map((p) => p.textContent)).toEqual([
      "Cambios en el patrimonio",
      "Flujo de efectivo",
      "Comparativos",
    ]);
  });

  it("muestra las tres actividades, la variación neta y el efectivo inicial y final", async () => {
    const { peticiones } = await abrirFlujo(estado());

    const tabla = await screen.findByRole("table");
    expect(
      within(tabla)
        .getAllByRole("row")
        .slice(1)
        .map((f) => f.textContent),
    ).toEqual([
      "Actividades de operación",
      "Utilidad neta del período7,594.99",
      "(+) Depreciación, amortización y deterioro del período104.17",
      "(−) Aumento de inventarios(5,888.00)",
      "Efectivo neto de actividades de operación1,811.16",
      "Actividades de inversión",
      "Compra o venta de propiedad, planta, equipo e intangibles(2,500.00)",
      "Efectivo neto de actividades de inversión(2,500.00)",
      "Actividades de financiamiento",
      "Aportes de capital22,500.00",
      "Retiros del titular(450.00)",
      "Efectivo neto de actividades de financiamiento22,050.00",
      "Variación neta del efectivo21,361.16",
      "Efectivo al inicio del período0.00",
      "Efectivo al final del período21,361.16",
    ]);
    expect(Object.fromEntries(peticiones.find((p) => p.ruta.endsWith("/flujo-efectivo"))!.consulta)).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-31",
    });
    expect(
      screen.getByText("La variación neta coincide con la de caja y bancos: US$ 21,361.16."),
    ).toBeInTheDocument();
  });

  it("avisa cuando la variación no coincide con la de caja y bancos", async () => {
    await abrirFlujo(estado({ cuadra: false, variacionLibros: "21000.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La variación neta (US$ 21,361.16) no coincide con la de caja y bancos (US$ 21,000.00).",
    );
  });

  it("indica las actividades sin movimientos", async () => {
    await abrirFlujo(
      estado({ inversion: { titulo: "Actividades de inversión", renglones: [], total: "0.00" } }),
    );
    expect(await screen.findByText("Sin movimientos en este período.")).toBeInTheDocument();
  });

  it("exporta el estado con las firmas de la empresa", async () => {
    const { usuario } = await abrirFlujo(estado());
    await usuario.click(await screen.findByRole("button", { name: "Exportar con firmas" }));
    expect(screen.getByRole("dialog", { name: "Exportar estado de flujo de efectivo" })).toBeInTheDocument();
  });

  it("el documento exportable lleva las actividades con su total y el efectivo final resaltado", () => {
    const doc = documentoFlujoEfectivo(
      estado({ formato: "niif_pymes", titulo: "Estado de flujos de efectivo" }),
    );
    expect(doc.columnas.map((c) => c.titulo)).toEqual(["US$"]);
    expect(doc.filas.filter((f) => f.tipo === "seccion").map((f) => f.texto)).toEqual([
      "Actividades de operación",
      "Actividades de inversión",
      "Actividades de financiamiento",
    ]);
    expect(doc.filas.find((f) => f.id === "operacion-total")?.valores).toEqual(["1811.16"]);
    expect(doc.filas.at(-1)).toMatchObject({
      texto: "Efectivo y equivalentes al final del período",
      valores: ["21361.16"],
      tipo: "resultado",
    });
    expect(doc.periodo).toBe("Del 01/10/2026 al 31/10/2026");
    expect(doc.nombreArchivo).toBe("estado-flujo-efectivo-2026-10-01-2026-10-31");
  });
});
