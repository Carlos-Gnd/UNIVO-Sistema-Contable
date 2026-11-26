import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { AlertasTributarias, Vencimiento } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { AlertaVencimientos } from "./alerta-vencimientos";
import { PantallaCalendario } from "./pantalla-calendario";

const E = "e1";
const RAIZ = `/empresas/${E}/calendario-tributario`;
const CONTADOR: CodigoPermiso[] = ["declaraciones.ver", "declaraciones.generar"];
const CONSULTA: CodigoPermiso[] = ["declaraciones.ver"];

const v = (extra: Partial<Vencimiento>): Vencimiento => ({
  obligacion: "f07",
  periodo: "2026-10",
  titulo: "F-07 IVA · octubre",
  tipo: "IVA",
  fecha: "2026-11-16",
  estado: "proxima",
  diasRestantes: 3,
  presentadaEn: null,
  nota: null,
  ...extra,
});
const NOVIEMBRE = [
  v({}),
  v({ obligacion: "f14", titulo: "F-14 Pago a cuenta · octubre", tipo: "Renta" }),
  v({
    obligacion: "planilla",
    titulo: "Planilla ISSS y AFP · octubre",
    tipo: "Planilla",
    estado: "presentada",
    presentadaEn: "2026-11-10T15:00:00.000Z",
  }),
];

const abrir = (permisos: CodigoPermiso[] = CONTADOR) =>
  renderizar(<PantallaCalendario parametros={{ empresaId: E }} />, { permisos });

describe("calendario tributario (S3-T56)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("pide los vencimientos del mes actual y los lista con su estado", async () => {
    const peticiones = simularApi({
      [`GET ${RAIZ}`]: { cuerpo: { hoy: "2026-11-13", vencimientos: NOVIEMBRE } },
    });
    abrir();

    expect(await screen.findByText("F-07 IVA · octubre")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Noviembre 2026" })).toBeInTheDocument();
    expect(peticiones[0]?.consulta.get("desde")).toBe("2026-11-01");
    expect(peticiones[0]?.consulta.get("hasta")).toBe("2026-11-30");
    const fila = screen.getByText("Planilla ISSS y AFP · octubre").closest("li")!;
    expect(within(fila).getByText("Presentada", { selector: "span" })).toBeInTheDocument();
    expect(screen.getAllByText("Próxima")).toHaveLength(2);
  });

  it("marca los días con vencimientos en el calendario y filtra la lista al elegir uno", async () => {
    simularApi({
      [`GET ${RAIZ}`]: {
        cuerpo: {
          hoy: "2026-11-13",
          vencimientos: [
            ...NOVIEMBRE,
            v({ obligacion: "f14", periodo: "2026-09", titulo: "Otro", fecha: "2026-11-05" }),
          ],
        },
      },
    });
    const { usuario } = abrir();

    await screen.findByText("F-07 IVA · octubre");
    expect(screen.getByRole("button", { name: "16 de noviembre, 3 vencimientos" })).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "5 de noviembre, 1 vencimiento" }));
    expect(screen.getByText("Otro")).toBeInTheDocument();
    expect(screen.queryByText("F-07 IVA · octubre")).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Ver todo el mes" }));
    expect(screen.getByText("F-07 IVA · octubre")).toBeInTheDocument();
  });

  it("cambia de mes y vuelve a pedir los vencimientos", async () => {
    const peticiones = simularApi({ [`GET ${RAIZ}`]: { cuerpo: { hoy: "2026-11-13", vencimientos: [] } } });
    const { usuario } = abrir();

    await screen.findByText("Sin vencimientos en esta fecha.");
    await usuario.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(await screen.findByRole("heading", { name: "Diciembre 2026" })).toBeInTheDocument();
    await waitFor(() => expect(peticiones.at(-1)?.consulta.get("desde")).toBe("2026-12-01"));
    expect(peticiones.at(-1)?.consulta.get("hasta")).toBe("2026-12-31");
    await usuario.click(screen.getByRole("button", { name: "Mes anterior" }));
    await usuario.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(await screen.findByRole("heading", { name: "Octubre 2026" })).toBeInTheDocument();
  });

  it("el contador marca un vencimiento como presentado", async () => {
    const peticiones = simularApi({
      [`GET ${RAIZ}`]: { cuerpo: { hoy: "2026-11-13", vencimientos: NOVIEMBRE } },
      [`POST ${RAIZ}/f07/2026-10/presentada`]: { cuerpo: v({ estado: "presentada" }) },
    });
    const { usuario } = abrir();

    await usuario.click(
      await screen.findByRole("button", { name: "Marcar F-07 IVA · octubre como presentada" }),
    );
    await waitFor(() =>
      expect(peticiones.some((p) => p.metodo === "POST" && p.ruta.endsWith("/f07/2026-10/presentada"))).toBe(
        true,
      ),
    );
  });

  it("quien solo consulta ve el calendario sin los botones para marcar", async () => {
    simularApi({ [`GET ${RAIZ}`]: { cuerpo: { hoy: "2026-11-13", vencimientos: NOVIEMBRE } } });
    abrir(CONSULTA);

    await screen.findByText("F-07 IVA · octubre");
    expect(screen.queryByRole("button", { name: /como presentada/ })).not.toBeInTheDocument();
  });
});

describe("alerta del tablero (HU-52)", () => {
  const alertas = (lista: Vencimiento[]): AlertasTributarias => ({
    hoy: "2026-11-13",
    diasDeAlerta: 5,
    alertas: lista,
  });

  it("avisa lo que vence pronto y lo vencido, con un enlace al calendario", async () => {
    simularApi({
      [`GET ${RAIZ}/alertas`]: {
        cuerpo: alertas([
          v({ diasRestantes: 0 }),
          v({
            obligacion: "f14",
            titulo: "F-14 Pago a cuenta · septiembre",
            estado: "vencida",
            diasRestantes: -2,
          }),
        ]),
      },
    });
    renderizar(<AlertaVencimientos empresaId={E} />, { permisos: CONTADOR });

    const aviso = await screen.findByRole("alert", { name: "Vencimientos tributarios" });
    expect(within(aviso).getByText("F-07 IVA · octubre: vence hoy")).toBeInTheDocument();
    expect(within(aviso).getByText("F-14 Pago a cuenta · septiembre: vencida")).toBeInTheDocument();
    expect(within(aviso).getByRole("link", { name: "Ver el calendario" })).toHaveAttribute("href", RAIZ);
  });

  it("sin vencimientos próximos no muestra nada", async () => {
    simularApi({ [`GET ${RAIZ}/alertas`]: { cuerpo: alertas([]) } });
    const { container } = renderizar(<AlertaVencimientos empresaId={E} />, { permisos: CONTADOR });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
