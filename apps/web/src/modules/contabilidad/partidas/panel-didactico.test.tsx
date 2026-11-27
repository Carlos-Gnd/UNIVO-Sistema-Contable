import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { ExplicacionDidacticaPartida } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PanelDidactico } from "./panel-didactico";
import type { LineaPartidaVista } from "./tipos";

const CAJA = "10000000-0000-4000-8000-000000000001";
const VENTAS = "10000000-0000-4000-8000-000000000002";
const IVA = "10000000-0000-4000-8000-000000000003";

const lineas: LineaPartidaVista[] = [
  {
    cuentaId: CAJA,
    codigo: "110101",
    nombre: "Caja general",
    debe: "6780.00",
    haber: "0.00",
    concepto: null,
  },
  { cuentaId: VENTAS, codigo: "5101", nombre: "Ventas", debe: "0.00", haber: "6000.00", concepto: null },
  {
    cuentaId: IVA,
    codigo: "2109",
    nombre: "IVA Débito Fiscal",
    debe: "0.00",
    haber: "780.00",
    concepto: null,
  },
];

const explicacion: ExplicacionDidacticaPartida = {
  regla: {
    codigo: "ventas",
    nombre: "Registro de venta",
    explicacion: "La venta reconoce el ingreso frente al efectivo.",
  },
  lineas: [
    { cuentaId: CAJA, lado: "debe", explicacion: "Entra dinero a la caja." },
    { cuentaId: VENTAS, lado: "haber", explicacion: "Es un ingreso por la venta." },
    { cuentaId: IVA, lado: "haber", explicacion: "El IVA cobrado se debe a Hacienda." },
  ],
  esquemaT: {
    debe: [{ codigo: "110101", nombre: "Caja general", monto: "6780.00" }],
    haber: [
      { codigo: "5101", nombre: "Ventas", monto: "6000.00" },
      { codigo: "2109", nombre: "IVA Débito Fiscal", monto: "780.00" },
    ],
  },
};

const RUTA = "/usuarios/me/modo-didactico";

describe("panel didáctico (HU-89, S4-T38)", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  it("con el modo activo muestra la regla, cada línea y el esquema T con sus sumas", async () => {
    simularApi({ [`GET ${RUTA}`]: { cuerpo: { activo: true } } });
    renderizar(<PanelDidactico explicacion={explicacion} lineas={lineas} />);

    expect(await screen.findByText(/La venta reconoce el ingreso/)).toBeInTheDocument();
    expect(screen.getByText("Entra dinero a la caja.")).toBeInTheDocument();
    expect(screen.getByText("El IVA cobrado se debe a Hacienda.")).toBeInTheDocument();
    expect(screen.getByText("110101 · Caja general · Debe")).toBeInTheDocument();

    const esquema = screen.getByRole("region", { name: "Esquema T de la partida" });
    expect(within(esquema).getByTestId("suma-debe")).toHaveTextContent("6,780.00");
    expect(within(esquema).getByTestId("suma-haber")).toHaveTextContent("6,780.00");
    expect(screen.getByRole("switch", { name: "Modo didáctico" })).toBeChecked();
  });

  it("con el modo apagado avisa y no muestra explicaciones", async () => {
    simularApi({ [`GET ${RUTA}`]: { cuerpo: { activo: false } } });
    renderizar(<PanelDidactico explicacion={explicacion} lineas={lineas} />);

    expect(await screen.findByText(/El modo didáctico está apagado/)).toBeInTheDocument();
    expect(screen.queryByText("Entra dinero a la caja.")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Esquema T de la partida" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Modo didáctico" })).not.toBeChecked();
  });

  it("el interruptor guarda la preferencia y muestra el panel", async () => {
    const peticiones = simularApi({
      [`GET ${RUTA}`]: { cuerpo: { activo: false } },
      [`PATCH ${RUTA}`]: { cuerpo: { activo: true } },
    });
    const { usuario } = renderizar(<PanelDidactico explicacion={explicacion} lineas={lineas} />);

    const interruptor = await screen.findByRole("switch", { name: "Modo didáctico" });
    await waitFor(() => expect(interruptor).toBeEnabled());
    await usuario.click(interruptor);

    expect(await screen.findByText("Entra dinero a la caja.")).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ activo: true });
    expect(screen.getByRole("switch", { name: "Modo didáctico" })).toBeChecked();
  });

  it("si no se puede guardar, conserva el estado anterior", async () => {
    simularApi({
      [`GET ${RUTA}`]: { cuerpo: { activo: false } },
      [`PATCH ${RUTA}`]: { estado: 500, cuerpo: { message: "falló" } },
    });
    const { usuario } = renderizar(<PanelDidactico explicacion={explicacion} lineas={lineas} />);

    const interruptor = await screen.findByRole("switch", { name: "Modo didáctico" });
    await waitFor(() => expect(interruptor).toBeEnabled());
    await usuario.click(interruptor);

    await waitFor(() => expect(screen.getByRole("switch", { name: "Modo didáctico" })).toBeEnabled());
    expect(screen.getByRole("switch", { name: "Modo didáctico" })).not.toBeChecked();
    expect(screen.queryByText("Entra dinero a la caja.")).not.toBeInTheDocument();
  });
});
