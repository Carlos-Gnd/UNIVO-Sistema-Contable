import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { SucursalDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaPartida } from "../partidas/pantalla-partida";
import type { PartidaVista } from "../partidas/tipos";
import { BarraContabilizarLote, type PartidaSeleccionada } from ".";

const E = "e1";
const CONTADOR: CodigoPermiso[] = ["partidas.ver", "partidas.registrar", "partidas.contabilizar"];
const AUXILIAR: CodigoPermiso[] = ["partidas.ver", "partidas.registrar"];
const SUCURSAL = "20000000-0000-4000-8000-000000000001";
const CAJA = "10000000-0000-4000-8000-000000000002";
const LUZ = "10000000-0000-4000-8000-000000000005";

const sucursal: SucursalDetalle = {
  id: SUCURSAL,
  empresaId: E,
  nombre: "Casa matriz",
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz: true,
  activa: true,
  creadoEn: "2026-11-10T00:00:00.000Z",
  actualizadoEn: "2026-11-10T00:00:00.000Z",
};

const borrador = (extra: Partial<PartidaVista> = {}): PartidaVista => ({
  id: "p1",
  sucursalId: SUCURSAL,
  fecha: "2026-11-09",
  tipo: "operacion",
  estado: "borrador",
  numero: null,
  concepto: "Pago de energía eléctrica",
  documentoTipo: null,
  documentoNumero: null,
  origen: "manual",
  lineas: [
    {
      cuentaId: LUZ,
      codigo: "5101",
      nombre: "Energía eléctrica",
      debe: "85.40",
      haber: "0.00",
      concepto: null,
    },
    {
      cuentaId: CAJA,
      codigo: "110101",
      nombre: "Caja general",
      debe: "0.00",
      haber: "85.40",
      concepto: null,
    },
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
        id: LUZ,
        codigo: "5101",
        nombre: "Energía eléctrica",
        nivel: 4,
        naturaleza: "deudora",
        tipo: "costos_gastos",
        cuentaPadreId: null,
        activa: true,
      },
      {
        id: CAJA,
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
  [`GET /empresas/${E}/sucursales`]: { cuerpo: [sucursal] },
};

const abrirBorrador = (permisos: CodigoPermiso[]) =>
  renderizar(<PantallaPartida parametros={{ empresaId: E, partidaId: "p1" }} />, { permisos });

describe("contabilizar una partida (S1-T86)", () => {
  it("el contador la contabiliza tras confirmar y la partida queda con su número", async () => {
    let contabilizada = false;
    const peticiones = simularApi({
      ...BASE,
      [`GET /empresas/${E}/partidas/p1`]: () => ({
        cuerpo: contabilizada
          ? borrador({ estado: "contabilizada", numero: 8, actualizadoEn: "2026-11-09T12:00:00.000Z" })
          : borrador(),
      }),
      [`POST /empresas/${E}/partidas/p1/contabilizar`]: () => {
        contabilizada = true;
        return { cuerpo: { id: "p1", numero: 8, ambito: "2026" } };
      },
    });
    const { usuario } = abrirBorrador(CONTADOR);

    const boton = await screen.findByRole("button", { name: "Contabilizar" });
    await waitFor(() => expect(boton).toBeEnabled());
    await usuario.click(boton);

    const dialogo = screen.getByRole("dialog", { name: "¿Contabilizar la partida?" });
    expect(dialogo).toHaveTextContent("09/11/2026 · Operación");
    expect(dialogo).toHaveTextContent("US$ 85.40");
    await usuario.click(within(dialogo).getByRole("button", { name: "Contabilizar" }));

    expect(await screen.findByRole("heading", { name: "Partida n.º 8" })).toBeInTheDocument();
    expect(peticiones.filter((p) => p.metodo === "POST").map((p) => p.ruta)).toEqual([
      `/empresas/${E}/partidas/p1/contabilizar`,
    ]);
    expect(screen.queryByRole("button", { name: "Contabilizar" })).not.toBeInTheDocument();
  });

  it("muestra en el diálogo el motivo del rechazo de la API", async () => {
    simularApi({
      ...BASE,
      [`GET /empresas/${E}/partidas/p1`]: { cuerpo: borrador() },
      [`POST /empresas/${E}/partidas/p1/contabilizar`]: {
        estado: 422,
        cuerpo: { id: "p1", motivo: "regla_contable", mensaje: "El período 2026-11 está cerrado." },
      },
    });
    const { usuario } = abrirBorrador(CONTADOR);
    const boton = await screen.findByRole("button", { name: "Contabilizar" });
    await waitFor(() => expect(boton).toBeEnabled());
    await usuario.click(boton);
    await usuario.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Contabilizar" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "El período 2026-11 está cerrado.",
    );
  });

  it("solo se habilita con la partida guardada, sin cambios pendientes y cuadrada", async () => {
    simularApi({ ...BASE, [`GET /empresas/${E}/partidas/p1`]: { cuerpo: borrador() } });
    const { usuario } = abrirBorrador(CONTADOR);
    const boton = await screen.findByRole("button", { name: "Contabilizar" });
    await waitFor(() => expect(boton).toBeEnabled());

    const haber = screen.getByRole("textbox", { name: "Haber de 110101 Caja general" });
    await usuario.clear(haber);
    await usuario.type(haber, "80");
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription("Guarda el borrador para contabilizarlo.");
  });

  it("en una partida nueva aparece deshabilitado hasta guardarla", async () => {
    simularApi(BASE);
    renderizar(<PantallaPartida parametros={{ empresaId: E }} />, { permisos: CONTADOR });
    expect(await screen.findByRole("button", { name: "Contabilizar" })).toBeDisabled();
  });

  it("el auxiliar no ve el botón y se le indica que lo revisará un contador", async () => {
    simularApi({ ...BASE, [`GET /empresas/${E}/partidas/p1`]: { cuerpo: borrador() } });
    abrirBorrador(AUXILIAR);

    expect(await screen.findByText("Un contador revisará y contabilizará tu borrador.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contabilizar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeInTheDocument();
  });
});

const seleccion: PartidaSeleccionada[] = [
  { id: "p2", fecha: "2026-11-10", concepto: "Venta al contado", totalDebe: "100.00" },
  { id: "p1", fecha: "2026-11-09", concepto: "Pago de energía", totalDebe: "85.40" },
  { id: "p3", fecha: "2026-11-11", concepto: null, totalDebe: "0.10" },
];

describe("contabilizar por lote (S1-T86)", () => {
  it("muestra la cantidad y el total, y contabiliza en orden de fecha", async () => {
    const peticiones = simularApi({
      [`POST /empresas/${E}/partidas/contabilizar`]: {
        cuerpo: {
          contabilizadas: [
            { id: "p1", numero: 8, ambito: "2026" },
            { id: "p2", numero: 9, ambito: "2026" },
          ],
          rechazadas: [{ id: "p3", motivo: "no_cuadra", mensaje: "La partida no cuadra." }],
        },
      },
    });
    const onContabilizadas = vi.fn();
    const { usuario } = renderizar(
      <BarraContabilizarLote
        empresaId={E}
        seleccion={seleccion}
        onQuitarSeleccion={() => {}}
        onContabilizadas={onContabilizadas}
      />,
      { permisos: CONTADOR },
    );

    expect(screen.getByText("3 seleccionadas · US$ 185.50")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Contabilizar 3" }));

    const dialogo = screen.getByRole("dialog", { name: "¿Contabilizar 3 partidas?" });
    expect(
      within(dialogo)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "09/11/2026Pago de energía85.40",
      "10/11/2026Venta al contado100.00",
      "11/11/2026Sin concepto0.10",
    ]);
    await usuario.click(within(dialogo).getByRole("button", { name: "Contabilizar" }));

    const rechazo = await screen.findByRole("dialog", { name: "1 partida no se contabilizó" });
    expect(rechazo).toHaveTextContent("Sin conceptoLa partida no cuadra.");
    expect(peticiones[0]?.cuerpo).toEqual({ ids: ["p1", "p2", "p3"] });
    expect(onContabilizadas).toHaveBeenCalledWith(["p1", "p2"]);

    await usuario.click(within(rechazo).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("permite quitar la selección", async () => {
    const onQuitarSeleccion = vi.fn();
    const { usuario } = renderizar(
      <BarraContabilizarLote empresaId={E} seleccion={seleccion} onQuitarSeleccion={onQuitarSeleccion} />,
      { permisos: CONTADOR },
    );
    await usuario.click(screen.getByRole("button", { name: "Quitar selección" }));
    expect(onQuitarSeleccion).toHaveBeenCalledOnce();
  });

  it("no aparece sin selección ni para el auxiliar", () => {
    const { rerender } = renderizar(
      <BarraContabilizarLote empresaId={E} seleccion={[]} onQuitarSeleccion={() => {}} />,
      { permisos: CONTADOR },
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    rerender(<BarraContabilizarLote empresaId={E} seleccion={seleccion} onQuitarSeleccion={() => {}} />);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("oculta la barra a quien no puede contabilizar", () => {
    renderizar(<BarraContabilizarLote empresaId={E} seleccion={seleccion} onQuitarSeleccion={() => {}} />, {
      permisos: AUXILIAR,
    });
    expect(screen.queryByRole("button", { name: /Contabilizar/ })).not.toBeInTheDocument();
  });

  it("no envía más del máximo por lote", () => {
    const muchas = Array.from({ length: 101 }, (_, i) => ({
      id: `p${i}`,
      fecha: "2026-11-09",
      concepto: null,
      totalDebe: "1.00",
    }));
    renderizar(<BarraContabilizarLote empresaId={E} seleccion={muchas} onQuitarSeleccion={() => {}} />, {
      permisos: CONTADOR,
    });
    expect(screen.getByRole("button", { name: "Contabilizar 101" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Se contabilizan como máximo 100 partidas a la vez.");
  });
});
