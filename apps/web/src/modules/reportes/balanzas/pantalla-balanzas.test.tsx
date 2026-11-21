import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { Balanza, TipoBalanza } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaBalanzas } from "./pantalla-balanzas";

const E = "e1";
const S1 = "20000000-0000-4000-8000-000000000001";
const SUCURSALES = `GET /empresas/${E}/sucursales`;
const EMPRESA = `GET /empresas/${E}`;
const ruta = (tipo: TipoBalanza) => `GET /empresas/${E}/balanzas/${tipo}`;

const sucursal = (id: string, nombre: string, esMatriz = false) => ({
  id,
  empresaId: E,
  nombre,
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "0001",
  direccion: null,
  esMatriz,
  activa: true,
  creadoEn: "2026-11-01T00:00:00.000Z",
  actualizadoEn: "2026-11-01T00:00:00.000Z",
});

const balanza = (extra: Partial<Balanza> = {}): Balanza => ({
  tipo: "antes-ajustes",
  titulo: "Balanza de comprobación antes de ajustes",
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  lineas: [
    {
      cuentaId: "c1",
      codigo: "110101",
      nombre: "Caja general",
      naturaleza: "deudora",
      tipo: "activo",
      saldoInicialDebe: "100.00",
      saldoInicialHaber: "0.00",
      movimientoDebe: "50.00",
      movimientoHaber: "20.00",
      saldoFinalDebe: "130.00",
      saldoFinalHaber: "0.00",
      saldoContrario: false,
    },
    {
      cuentaId: "c2",
      codigo: "310101",
      nombre: "Capital social",
      naturaleza: "acreedora",
      tipo: "patrimonio",
      saldoInicialDebe: "0.00",
      saldoInicialHaber: "100.00",
      movimientoDebe: "20.00",
      movimientoHaber: "50.00",
      saldoFinalDebe: "0.00",
      saldoFinalHaber: "130.00",
      saldoContrario: false,
    },
  ],
  totales: {
    saldoInicialDebe: "100.00",
    saldoInicialHaber: "100.00",
    movimientoDebe: "70.00",
    movimientoHaber: "70.00",
    saldoFinalDebe: "130.00",
    saldoFinalHaber: "130.00",
  },
  diferencias: { saldoInicial: "0.00", movimientos: "0.00", saldoFinal: "0.00" },
  cuadra: true,
  ...extra,
});

const BASE = {
  [SUCURSALES]: { cuerpo: [sucursal(S1, "Casa matriz", true), sucursal("s2", "San Miguel Centro")] },
  [EMPRESA]: { cuerpo: { id: E, nombre: "CheroPhonex S.A. de C.V.", nombreComercial: "CheroPhonex" } },
};

const abrir = (
  permisos: string[] = ["reportes.ver"],
  alcance: { todasSucursales?: boolean; sucursales?: string[] } = {},
) =>
  renderizar(<PantallaBalanzas parametros={{ empresaId: E }} />, {
    permisos: permisos as never,
    ...alcance,
  });

describe("balanzas de comprobación (S2-T30, HU-30)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("pide la balanza consolidada del mes en curso y muestra saldos, movimientos y totales", async () => {
    const peticiones = simularApi({ ...BASE, [ruta("antes-ajustes")]: { cuerpo: balanza() } });
    abrir();

    expect(await screen.findByText("Caja general")).toBeInTheDocument();
    const consulta = peticiones.find((p) => p.ruta.endsWith("/balanzas/antes-ajustes"));
    expect(consulta?.consulta.get("desde")).toBe("2026-11-01");
    expect(consulta?.consulta.get("hasta")).toBe("2026-11-30");
    expect(consulta?.consulta.has("sucursalId")).toBe(false);

    expect(screen.getByRole("status")).toHaveTextContent("Debe y haber cuadran");
    const totales = screen.getByRole("row", { name: /Totales/ });
    expect(
      within(totales)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["Totales", "100.00", "100.00", "70.00", "70.00", "130.00", "130.00"]);
    expect(await screen.findByText("CheroPhonex")).toBeInTheDocument();
  });

  it("cambia de tipo de balanza con las pestañas", async () => {
    const peticiones = simularApi({
      ...BASE,
      [ruta("antes-ajustes")]: { cuerpo: balanza() },
      [ruta("ajustada")]: {
        cuerpo: balanza({ tipo: "ajustada", titulo: "Balanza de comprobación ajustada" }),
      },
    });
    const { usuario } = abrir();

    await screen.findByText("Caja general");
    await usuario.click(screen.getByRole("tab", { name: "Ajustada" }));
    expect(
      await screen.findByRole("heading", { name: "Balanza de comprobación ajustada" }),
    ).toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta.endsWith("/balanzas/ajustada"))).toBe(true);
  });

  it("filtra por sucursal enviando sucursalId", async () => {
    const peticiones = simularApi({ ...BASE, [ruta("antes-ajustes")]: { cuerpo: balanza() } });
    const { usuario } = abrir();

    await screen.findByText("Caja general");
    await usuario.selectOptions(await screen.findByLabelText("Sucursal"), "s2");
    await waitFor(() => expect(peticiones.some((p) => p.consulta.get("sucursalId") === "s2")).toBe(true));
  });

  it("ofrece solo las sucursales asignadas al usuario limitado", async () => {
    simularApi({ ...BASE, [ruta("antes-ajustes")]: { cuerpo: balanza() } });
    abrir(["reportes.ver"], { todasSucursales: false, sucursales: ["s2"] });

    await screen.findByText("Caja general");
    const selector = await screen.findByLabelText("Sucursal");
    await waitFor(() =>
      expect(within(selector).getByRole("option", { name: "San Miguel Centro" })).toBeInTheDocument(),
    );
    expect(within(selector).queryByRole("option", { name: "Casa matriz" })).not.toBeInTheDocument();
  });

  it("avisa con la diferencia cuando la balanza no cuadra", async () => {
    simularApi({
      ...BASE,
      [ruta("antes-ajustes")]: {
        cuerpo: balanza({
          cuadra: false,
          diferencias: { saldoInicial: "0.00", movimientos: "5.00", saldoFinal: "5.00" },
        }),
      },
    });
    abrir();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No cuadra.");
    expect(alerta).toHaveTextContent("Los movimientos difieren en US$ 5.00.");
    expect(alerta).not.toHaveTextContent("saldos iniciales");
  });

  it("no consulta con un rango de fechas inválido", async () => {
    const peticiones = simularApi({ ...BASE, [ruta("antes-ajustes")]: { cuerpo: balanza() } });
    const { usuario } = abrir();

    await screen.findByText("Caja general");
    const antes = peticiones.length;
    const desde = screen.getByLabelText("Desde");
    await usuario.clear(desde);
    await usuario.type(desde, "2026-12-15");
    expect(
      await screen.findByText("La fecha inicial no puede ser posterior a la final."),
    ).toBeInTheDocument();
    expect(peticiones.slice(antes).some((p) => p.ruta.includes("/balanzas/"))).toBe(false);
  });

  it("muestra el rechazo de la API", async () => {
    simularApi({
      ...BASE,
      [ruta("antes-ajustes")]: {
        estado: 422,
        cuerpo: { message: "No hay un ejercicio que contenga el 2026-11-01." },
      },
    });
    abrir();

    expect(await screen.findByText(/No hay un ejercicio que contenga el 2026-11-01\./)).toBeInTheDocument();
  });

  it("no ofrece el reporte sin el permiso reportes.ver", () => {
    const peticiones = simularApi({});
    abrir([]);

    expect(screen.getByText("Tu rol no permite consultar este reporte.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });
});
