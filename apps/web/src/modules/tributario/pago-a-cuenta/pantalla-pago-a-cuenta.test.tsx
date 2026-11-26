import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { DeclaracionPagoACuentaVista, PagoACuentaVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaPagoACuenta } from "./pantalla-pago-a-cuenta";

const E = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARTIDA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GET = `GET /empresas/${E}/pago-a-cuenta`;
const GENERAR = `POST /empresas/${E}/pago-a-cuenta/partida`;
const PRESENTAR = `POST /empresas/${E}/pago-a-cuenta/presentar`;
const CONTADOR: CodigoPermiso[] = ["declaraciones.ver", "declaraciones.generar"];
const SOLO_LECTURA: CodigoPermiso[] = ["declaraciones.ver"];

const declaracion = (extra: Partial<DeclaracionPagoACuentaVista> = {}): DeclaracionPagoACuentaVista => ({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  partidaId: PARTIDA,
  estadoPartida: "borrador",
  numeroPartida: null,
  tasa: "1.75",
  ingresosBrutos: "46051.20",
  pagoACuenta: "805.90",
  retencionesPlanilla: "0.00",
  retencionesServicios: "0.00",
  presentadaEn: null,
  desactualizada: false,
  ...extra,
});

const vista = (extra: Partial<PagoACuentaVista> = {}): PagoACuentaVista => ({
  anio: 2026,
  mes: 10,
  fechaPartida: "2026-10-31",
  tasa: "1.75",
  ingresosBrutos: "46051.20",
  pagoACuenta: "805.90",
  retencionesPlanilla: "263.89",
  retencionesServicios: "40.00",
  totalRetenciones: "303.89",
  totalAEnterar: "1109.79",
  lineasPartida: [
    { codigo: "111104", nombre: "Pago a Cuenta (activo)", debe: "805.90", haber: "0.00" },
    { codigo: "211101", nombre: "Pago a Cuenta (por pagar)", debe: "0.00", haber: "805.90" },
  ],
  declaracion: null,
  periodoAbierto: true,
  ...extra,
});

const abrir = (permisos: CodigoPermiso[] = CONTADOR) => {
  const resultado = renderizar(<PantallaPagoACuenta parametros={{ empresaId: E }} />, { permisos });
  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-10" } });
  return resultado;
};

afterEach(() => vi.unstubAllGlobals());

describe("pantalla de pago a cuenta y retenciones (HU-49, S3-T47)", () => {
  it("muestra el pago a cuenta, las retenciones y el total a enterar del mes", async () => {
    const peticiones = simularApi({ [GET]: { cuerpo: vista() } });
    abrir();
    expect(await screen.findByText("Pago a cuenta del impuesto sobre la renta (1.75 %)")).toBeInTheDocument();
    expect(screen.getByText("US$ 46,051.20")).toBeInTheDocument();
    expect(screen.getByText("US$ 805.90")).toBeInTheDocument();
    expect(screen.getByText("US$ 263.89")).toBeInTheDocument();
    expect(screen.getByText("US$ 40.00")).toBeInTheDocument();
    expect(screen.getByText("US$ 1,109.79")).toBeInTheDocument();
    expect(screen.getByText("Sin partida")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        peticiones.some((p) => p.ruta.endsWith("/pago-a-cuenta") && p.consulta.get("mes") === "10"),
      ).toBe(true),
    );
  });

  it("genera la partida tras mostrar su vista previa y confirmar", async () => {
    const peticiones = simularApi({
      [GET]: { cuerpo: vista() },
      [GENERAR]: { estado: 201, cuerpo: vista({ declaracion: declaracion() }) },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Generar partida de pago a cuenta" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Pago a Cuenta (activo)")).toBeInTheDocument();
    expect(within(dialogo).getByText("Pago a Cuenta (por pagar)")).toBeInTheDocument();
    expect(within(dialogo).getByText(/31\/10\/2026/)).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar y generar" }));
    await waitFor(() =>
      expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({ anio: 2026, mes: 10 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("con la partida en borrador avisa y no deja presentar; contabilizada permite presentar", async () => {
    simularApi({ [GET]: { cuerpo: vista({ declaracion: declaracion() }) } });
    const primero = abrir();
    expect(await screen.findByText("Partida en borrador")).toBeInTheDocument();
    expect(screen.getByText(/Contabiliza la partida/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar como presentada" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generar partida de pago a cuenta" })).toBeDisabled();
    primero.unmount();

    const peticiones = simularApi({
      [GET]: {
        cuerpo: vista({ declaracion: declaracion({ estadoPartida: "contabilizada", numeroPartida: 41 }) }),
      },
      [PRESENTAR]: {
        estado: 201,
        cuerpo: vista({
          declaracion: declaracion({
            estadoPartida: "contabilizada",
            numeroPartida: 41,
            presentadaEn: "2026-11-25T12:00:00.000Z",
          }),
        }),
      },
    });
    const { usuario } = abrir();
    expect(await screen.findByText("Partida contabilizada n.º 41")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Marcar como presentada" }));
    await waitFor(() =>
      expect(peticiones.some((p) => p.metodo === "POST" && p.ruta.endsWith("/presentar"))).toBe(true),
    );
  });

  it("avisa cuando las cifras cambiaron después de generar la partida", async () => {
    simularApi({ [GET]: { cuerpo: vista({ declaracion: declaracion({ desactualizada: true }) }) } });
    abrir();
    expect(await screen.findByText(/Las cifras del mes cambiaron/)).toBeInTheDocument();
  });

  it("sin ingresos o con el período cerrado no permite generar y explica por qué", async () => {
    simularApi({
      [GET]: { cuerpo: vista({ ingresosBrutos: "0.00", pagoACuenta: "0.00", totalAEnterar: "0.00" }) },
    });
    const sinIngresos = abrir();
    expect(await screen.findByText(/no tiene ingresos contabilizados/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar partida de pago a cuenta" })).toBeDisabled();
    sinIngresos.unmount();

    simularApi({ [GET]: { cuerpo: vista({ periodoAbierto: false }) } });
    abrir();
    expect(await screen.findByText(/período contable de este mes está cerrado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar partida de pago a cuenta" })).toBeDisabled();
  });

  it("un usuario solo con lectura ve las cifras pero no los botones", async () => {
    simularApi({ [GET]: { cuerpo: vista() } });
    abrir(SOLO_LECTURA);
    expect(await screen.findByText("US$ 1,109.79")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generar partida de pago a cuenta" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar como presentada" })).not.toBeInTheDocument();
  });

  it("muestra el error de la API al generar", async () => {
    simularApi({
      [GET]: { cuerpo: vista() },
      [GENERAR]: { estado: 422, cuerpo: { message: "El período está cerrado." } },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Generar partida de pago a cuenta" }));
    await usuario.click(await screen.findByRole("button", { name: "Confirmar y generar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El período está cerrado.");
  });
});
