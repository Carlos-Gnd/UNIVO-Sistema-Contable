import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { LibroDiario, RenglonDiario } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaLibroDiario } from "./pantalla-libro-diario";

const E = "e1";
const S1 = "20000000-0000-4000-8000-000000000001";
const LIBRO = `GET /empresas/${E}/libro-diario`;
const BASE = {
  [`GET /empresas/${E}/sucursales`]: {
    cuerpo: [
      {
        id: S1,
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
  [`GET /empresas/${E}`]: { cuerpo: { id: E, nombre: "CheroPhonex, S.A. de C.V.", nombreComercial: null } },
};

const r = (extra: Partial<RenglonDiario>): RenglonDiario => ({
  tipo: "cuenta",
  partidaId: "p1",
  fecha: null,
  codigo: null,
  descripcion: "",
  parcial: null,
  debe: null,
  haber: null,
  ...extra,
});

const PARTIDA_1: RenglonDiario[] = [
  r({ tipo: "partida", fecha: "2026-11-03", descripcion: "Partida n.º 1" }),
  r({ codigo: "1101", descripcion: "Efectivo y equivalentes", debe: "113.00" }),
  r({ tipo: "subcuenta", codigo: "110101", descripcion: "Caja general", parcial: "113.00" }),
  r({ codigo: "5101", descripcion: "Ventas", haber: "113.00" }),
  r({ tipo: "concepto", descripcion: "V/ Venta al contado" }),
];

const libro = (extra: Partial<LibroDiario> = {}): LibroDiario => ({
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  tipo: null,
  renglonesPorPagina: 40,
  partidas: 2,
  paginas: [
    {
      folio: 1,
      vienen: { debe: "0.00", haber: "0.00" },
      renglones: PARTIDA_1,
      pasan: { debe: "113.00", haber: "113.00" },
    },
    {
      folio: 2,
      vienen: { debe: "113.00", haber: "113.00" },
      renglones: PARTIDA_1.map((x) => ({
        ...x,
        partidaId: "p2",
        descripcion: x.descripcion.replace("n.º 1", "n.º 2"),
      })),
      pasan: { debe: "226.00", haber: "226.00" },
    },
  ],
  totales: { debe: "226.00", haber: "226.00" },
  cuadra: true,
  ...extra,
});

const abrir = (permisos = ["reportes.ver"] as const) =>
  renderizar(<PantallaLibroDiario parametros={{ empresaId: E }} />, { permisos: [...permisos] });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 20, 9, 0));
});
afterEach(() => vi.useRealTimers());

describe("pantalla del libro diario (S2-T17)", () => {
  it("pide el mes actual y muestra cada folio con Vienen, Pasan y Totales", async () => {
    const peticiones = simularApi({ ...BASE, [LIBRO]: { cuerpo: libro() } });
    abrir();

    const folio1 = await screen.findByRole("region", { name: "Folio 1" });
    const consulta = peticiones.find((p) => p.ruta === `/empresas/${E}/libro-diario`)!.consulta;
    expect(Object.fromEntries(consulta)).toEqual({
      desde: "2026-11-01",
      hasta: "2026-11-30",
      renglonesPorPagina: "40",
    });

    expect(within(folio1).getByText("Partida n.º 1")).toBeInTheDocument();
    expect(within(folio1).getByText("V/ Venta al contado")).toBeInTheDocument();
    expect(within(folio1).queryByText("Vienen")).not.toBeInTheDocument();
    expect(within(folio1).getByText("Pasan").closest("tr")).toHaveTextContent("Pasan113.00113.00");

    const folio2 = screen.getByRole("region", { name: "Folio 2" });
    expect(within(folio2).getByText("Vienen").closest("tr")).toHaveTextContent("Vienen113.00113.00");
    expect(within(folio2).getByText("Totales").closest("tr")).toHaveTextContent("Totales226.00226.00");
    expect(screen.getByText("2 partidas · 2 folios")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Debe y haber cuadran");
  });

  it("filtra por tipo de partida, sucursal y renglones por folio", async () => {
    const peticiones = simularApi({ ...BASE, [LIBRO]: { cuerpo: libro() } });
    const { usuario } = abrir();
    await screen.findByRole("region", { name: "Folio 1" });

    await usuario.selectOptions(screen.getByLabelText("Tipo de partida"), "Ajuste");
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), "Casa matriz");
    await usuario.selectOptions(screen.getByLabelText("Renglones por folio"), "20");

    await waitFor(() => {
      const ultima = peticiones.filter((p) => p.ruta === `/empresas/${E}/libro-diario`).at(-1)!;
      expect(Object.fromEntries(ultima.consulta)).toEqual({
        desde: "2026-11-01",
        hasta: "2026-11-30",
        renglonesPorPagina: "20",
        sucursalId: S1,
        tipo: "ajuste",
      });
    });
  });

  it("avisa cuando el período no tiene partidas", async () => {
    simularApi({ ...BASE, [LIBRO]: { cuerpo: libro({ partidas: 0, paginas: [] }) } });
    abrir();
    expect(await screen.findByText("No hay partidas contabilizadas en el período.")).toBeInTheDocument();
  });

  it("no consulta con un rango de fechas inválido", async () => {
    const peticiones = simularApi({ ...BASE, [LIBRO]: { cuerpo: libro() } });
    const { usuario } = abrir();
    await screen.findByRole("region", { name: "Folio 1" });
    const antes = peticiones.filter((p) => p.ruta.endsWith("/libro-diario")).length;

    const desde = screen.getByLabelText("Desde");
    await usuario.clear(desde);
    await usuario.type(desde, "2026-12-15");

    expect(
      await screen.findByText("La fecha inicial no puede ser posterior a la final."),
    ).toBeInTheDocument();
    expect(peticiones.filter((p) => p.ruta.endsWith("/libro-diario"))).toHaveLength(antes);
  });

  it("muestra el error de la API, como un período fuera del ejercicio", async () => {
    simularApi({
      ...BASE,
      [LIBRO]: { estado: 422, cuerpo: { message: "El período debe estar dentro de un mismo ejercicio." } },
    });
    abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El período debe estar dentro de un mismo ejercicio.",
    );
  });

  it("sin reportes.ver no consulta el libro", () => {
    const peticiones = simularApi({});
    renderizar(<PantallaLibroDiario parametros={{ empresaId: E }} />, { permisos: [] });
    expect(screen.getByText("Tu rol no permite consultar este reporte.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });
});
