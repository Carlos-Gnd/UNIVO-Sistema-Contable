import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { DeclaracionLiquidacionIvaVista, LiquidacionIvaVista, PagoACuentaVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaDeclaraciones } from "./pantalla-declaraciones";

const E = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARTIDA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GET_F07 = `GET /empresas/${E}/liquidacion-iva`;
const GENERAR = `POST /empresas/${E}/liquidacion-iva/partida`;
const PRESENTAR = `POST /empresas/${E}/liquidacion-iva/presentar`;
const GET_F14 = `GET /empresas/${E}/pago-a-cuenta`;
const CONTADOR: CodigoPermiso[] = ["declaraciones.ver", "declaraciones.generar"];

const declaracion = (
  extra: Partial<DeclaracionLiquidacionIvaVista> = {},
): DeclaracionLiquidacionIvaVista => ({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  partidaId: PARTIDA,
  estadoPartida: "borrador",
  numeroPartida: null,
  debitoFiscal: "5986.67",
  ivaPorPagar: "643.67",
  remanenteTotal: "0.00",
  presentadaEn: null,
  desactualizada: false,
  ...extra,
});

/** Octubre de CheroPhonex: débito 5,986.67 menos crédito 5,343.00 = 643.67. */
const vista = (extra: Partial<LiquidacionIvaVista> = {}): LiquidacionIvaVista => ({
  anio: 2026,
  mes: 10,
  fechaPartida: "2026-10-31",
  debitoContribuyentes: "3331.00",
  debitoConsumidorFinal: "2655.67",
  debitoFiscal: "5986.67",
  creditoFiscal: "5343.00",
  percibidoSufrido: "0.00",
  retenidoSufrido: "0.00",
  remanenteAnterior: { credito: "0.00", percibido: "0.00", retenido: "0.00" },
  remanenteAnteriorTotal: "0.00",
  ivaPorPagar: "643.67",
  remanente: { credito: "0.00", percibido: "0.00", retenido: "0.00" },
  remanenteTotal: "0.00",
  percibidoEfectuado: "0.00",
  retenidoEfectuado: "0.00",
  totalAEnterar: "643.67",
  lineasPartida: [
    { codigo: "2109", nombre: "IVA Débito Fiscal", debe: "5986.67", haber: "0.00" },
    { codigo: "1112", nombre: "Crédito Fiscal IVA", debe: "0.00", haber: "5343.00" },
    { codigo: "211103", nombre: "IVA", debe: "0.00", haber: "643.67" },
  ],
  declaracion: null,
  periodoAbierto: true,
  ...extra,
});

const vistaF14: PagoACuentaVista = {
  anio: 2026,
  mes: 10,
  fechaPartida: "2026-10-31",
  tasa: "1.75",
  ingresosBrutos: "46051.20",
  pagoACuenta: "805.90",
  retencionesPlanilla: "0.00",
  retencionesServicios: "0.00",
  totalRetenciones: "0.00",
  totalAEnterar: "805.90",
  lineasPartida: [],
  declaracion: null,
  periodoAbierto: true,
};

const abrir = (permisos: CodigoPermiso[] = CONTADOR) => {
  const resultado = renderizar(<PantallaDeclaraciones parametros={{ empresaId: E }} />, { permisos });
  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-10" } });
  return resultado;
};

afterEach(() => vi.unstubAllGlobals());

describe("pantalla de declaraciones (HU-48, S3-T44)", () => {
  it("abre en el F-07 y muestra la liquidación de CheroPhonex: 5,986.67 menos 5,343.00 da 643.67", async () => {
    simularApi({ [GET_F07]: { cuerpo: vista() } });
    abrir();
    expect(await screen.findByText("Total débito fiscal")).toBeInTheDocument();
    expect(screen.getByText("US$ 3,331.00")).toBeInTheDocument();
    expect(screen.getByText("US$ 2,655.67")).toBeInTheDocument();
    expect(screen.getByText("US$ 5,986.67")).toBeInTheDocument();
    expect(screen.getByText("US$ 5,343.00")).toBeInTheDocument();
    expect(screen.getAllByText("US$ 643.67").length).toBeGreaterThan(0);
    expect(screen.getByText("Sin partida")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "F-07 · IVA" })).toHaveAttribute("aria-selected", "true");
  });

  it("cambia de pestaña al F-14 sin duplicar la pantalla del pago a cuenta", async () => {
    simularApi({ [GET_F07]: { cuerpo: vista() }, [GET_F14]: { cuerpo: vistaF14 } });
    const { usuario } = abrir();
    await screen.findByText("Total débito fiscal");
    await usuario.click(screen.getByRole("tab", { name: "F-14 · Renta" }));
    expect(await screen.findByText("Pago a cuenta del impuesto sobre la renta (1.75 %)")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Mes")).toHaveLength(1);
  });

  it("genera la partida tras mostrar su vista previa y confirmar", async () => {
    const peticiones = simularApi({
      [GET_F07]: { cuerpo: vista() },
      [GENERAR]: { estado: 201, cuerpo: vista({ declaracion: declaracion() }) },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Generar partida de liquidación" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("IVA Débito Fiscal")).toBeInTheDocument();
    expect(within(dialogo).getByText("Crédito Fiscal IVA")).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar y generar" }));
    await waitFor(() =>
      expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({ anio: 2026, mes: 10 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("con la partida en borrador no deja presentar; contabilizada permite presentar", async () => {
    simularApi({ [GET_F07]: { cuerpo: vista({ declaracion: declaracion() }) } });
    const primero = abrir();
    expect(await screen.findByText("Partida en borrador")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar como presentada" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generar partida de liquidación" })).toBeDisabled();
    primero.unmount();

    const peticiones = simularApi({
      [GET_F07]: {
        cuerpo: vista({ declaracion: declaracion({ estadoPartida: "contabilizada", numeroPartida: 52 }) }),
      },
      [PRESENTAR]: {
        estado: 201,
        cuerpo: vista({
          declaracion: declaracion({
            estadoPartida: "contabilizada",
            numeroPartida: 52,
            presentadaEn: "2026-11-25T12:00:00.000Z",
          }),
        }),
      },
    });
    const { usuario } = abrir();
    expect(await screen.findByText("Partida contabilizada n.º 52")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Marcar como presentada" }));
    await waitFor(() =>
      expect(peticiones.some((p) => p.metodo === "POST" && p.ruta.endsWith("/presentar"))).toBe(true),
    );
  });

  it("avisa del remanente que pasa al mes siguiente y del cambio de cifras tras generar", async () => {
    simularApi({
      [GET_F07]: {
        cuerpo: vista({
          debitoFiscal: "13.00",
          creditoFiscal: "130.00",
          ivaPorPagar: "0.00",
          remanenteTotal: "117.00",
          remanente: { credito: "117.00", percibido: "0.00", retenido: "0.00" },
          totalAEnterar: "0.00",
          declaracion: declaracion({ desactualizada: true }),
        }),
      },
    });
    abrir();
    expect(
      await screen.findByText(/queda un remanente de US\$ 117\.00 que se traslada a noviembre de 2026/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Las cifras del mes cambiaron/)).toBeInTheDocument();
  });

  it("sin débito fiscal o con el período cerrado no permite generar y explica por qué", async () => {
    simularApi({
      [GET_F07]: {
        cuerpo: vista({ debitoFiscal: "0.00", ivaPorPagar: "0.00", totalAEnterar: "0.00" }),
      },
    });
    const vacio = abrir();
    expect(await screen.findByText(/no tiene débito fiscal contabilizado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar partida de liquidación" })).toBeDisabled();
    vacio.unmount();

    simularApi({ [GET_F07]: { cuerpo: vista({ periodoAbierto: false }) } });
    abrir();
    expect(await screen.findByText(/período contable de este mes está cerrado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar partida de liquidación" })).toBeDisabled();
  });

  it("sin el permiso de generar no muestra las acciones, y sin ver avisa", async () => {
    simularApi({ [GET_F07]: { cuerpo: vista() } });
    const lectura = abrir(["declaraciones.ver"]);
    await screen.findByText("Total débito fiscal");
    expect(screen.queryByRole("button", { name: "Generar partida de liquidación" })).not.toBeInTheDocument();
    lectura.unmount();

    renderizar(<PantallaDeclaraciones parametros={{ empresaId: E }} />, { permisos: [] });
    expect(screen.getByText(/no permite consultar las declaraciones/)).toBeInTheDocument();
  });
});
