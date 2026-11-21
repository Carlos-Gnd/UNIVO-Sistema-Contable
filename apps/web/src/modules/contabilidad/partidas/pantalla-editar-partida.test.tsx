import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaEditarPartida } from "./pantalla-editar-partida";
import type { PartidaVista } from "./tipos";

const E = "e1";
const S = "20000000-0000-4000-8000-000000000001";
const C1 = "10000000-0000-4000-8000-000000000001";
const C2 = "10000000-0000-4000-8000-000000000002";
const CONTADOR: CodigoPermiso[] = ["partidas.ver", "partidas.registrar", "partidas.editar_contabilizada"];

const partida = (extra: Partial<PartidaVista> = {}): PartidaVista => ({
  id: "p1",
  sucursalId: S,
  fecha: "2026-11-09",
  tipo: "operacion",
  estado: "contabilizada",
  numero: 7,
  concepto: "Pago de energía",
  documentoTipo: null,
  documentoNumero: null,
  origen: "manual",
  lineas: [
    {
      cuentaId: C1,
      codigo: "5101",
      nombre: "Energía eléctrica",
      debe: "85.40",
      haber: "0.00",
      concepto: null,
    },
    { cuentaId: C2, codigo: "110101", nombre: "Caja general", debe: "0.00", haber: "85.40", concepto: null },
  ],
  totalDebe: "85.40",
  totalHaber: "85.40",
  diferencia: "0.00",
  cuadra: true,
  creadoEn: "2026-11-09T10:00:00.000Z",
  actualizadoEn: "2026-11-09T10:00:00.000Z",
  ...extra,
});

const BASE = {
  [`GET /empresas/${E}/cuentas`]: {
    cuerpo: [
      {
        id: C1,
        codigo: "5101",
        nombre: "Energía eléctrica",
        nivel: 4,
        naturaleza: "deudora",
        tipo: "costos_gastos",
        cuentaPadreId: null,
        activa: true,
      },
      {
        id: C2,
        codigo: "110101",
        nombre: "Caja general",
        nivel: 6,
        naturaleza: "deudora",
        tipo: "activo",
        cuentaPadreId: null,
        activa: true,
      },
    ],
  },
  [`GET /empresas/${E}/sucursales`]: {
    cuerpo: [
      {
        id: S,
        empresaId: E,
        nombre: "Casa matriz",
        codigoEstablecimiento: "M001",
        codigoPuntoVenta: "0001",
        direccion: null,
        esMatriz: true,
        activa: true,
        creadoEn: "2026-11-01T00:00:00.000Z",
        actualizadoEn: "2026-11-01T00:00:00.000Z",
      },
    ],
  },
};

const abrir = (permisos: CodigoPermiso[] = CONTADOR) =>
  renderizar(<PantallaEditarPartida parametros={{ empresaId: E, partidaId: "p1" }} />, { permisos });

describe("edición de una partida contabilizada (HU-23, S2-T08)", () => {
  beforeEach(() => window.history.replaceState(null, "", `/empresas/${E}/partidas/p1/editar`));

  it("carga la partida, avisa que se crea una versión nueva y guarda con PUT …/contabilizada", async () => {
    const peticiones = simularApi({
      ...BASE,
      [`GET /empresas/${E}/partidas/p1`]: { cuerpo: partida() },
      [`PUT /empresas/${E}/partidas/p1/contabilizada`]: { cuerpo: partida({ concepto: "Corregida" }) },
    });
    const { usuario } = abrir();

    expect(await screen.findByRole("heading", { name: "Editar partida n.º 7" })).toBeInTheDocument();
    expect(screen.getByText(/Al guardar se crea una versión nueva/)).toBeInTheDocument();
    const concepto = await screen.findByLabelText(/Concepto/);
    await usuario.clear(concepto);
    await usuario.type(concepto, "Corregida");
    await usuario.click(screen.getByRole("button", { name: "Guardar versión nueva" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "PUT")).toBe(true));
    const put = peticiones.find((p) => p.metodo === "PUT");
    expect(put?.ruta).toBe(`/empresas/${E}/partidas/p1/contabilizada`);
    expect(put?.cuerpo).toMatchObject({ concepto: "Corregida", sucursalId: S });
    await waitFor(() => expect(window.location.pathname).toBe(`/empresas/${E}/partidas/p1`));
  });

  it("muestra el rechazo de la API cuando el período está cerrado", async () => {
    simularApi({
      ...BASE,
      [`GET /empresas/${E}/partidas/p1`]: { cuerpo: partida() },
      [`PUT /empresas/${E}/partidas/p1/contabilizada`]: {
        estado: 422,
        cuerpo: { mensaje: "El período está cerrado." },
      },
    });
    const { usuario } = abrir();

    await usuario.type(await screen.findByLabelText(/Concepto/), " x");
    await usuario.click(screen.getByRole("button", { name: "Guardar versión nueva" }));

    expect(await screen.findByText("El período está cerrado.")).toBeInTheDocument();
  });

  it("queda en solo lectura sin el permiso de edición", async () => {
    simularApi({ ...BASE, [`GET /empresas/${E}/partidas/p1`]: { cuerpo: partida() } });
    abrir(["partidas.ver"]);

    expect(await screen.findByText("Tu rol no permite editar partidas contabilizadas.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar versión nueva" })).not.toBeInTheDocument();
  });

  it("no edita un borrador por esta ruta", async () => {
    simularApi({
      ...BASE,
      [`GET /empresas/${E}/partidas/p1`]: { cuerpo: partida({ estado: "borrador", numero: null }) },
    });
    abrir();

    expect(await screen.findByText(/Solo se pueden editar partidas contabilizadas/)).toBeInTheDocument();
  });
});
