import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { EstadoCambiosPatrimonio } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { documentoCambiosPatrimonio } from "./documento-patrimonio";
import { PantallaEstadosAdicionales } from "./pantalla-estados-adicionales";

const E = "e1";
const PATRIMONIO = `GET /empresas/${E}/estados/cambios-patrimonio`;
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

const estado = (extra: Partial<EstadoCambiosPatrimonio> = {}): EstadoCambiosPatrimonio => ({
  formato: "clase",
  titulo: "Estado de cambios en el patrimonio",
  desde: "2026-10-01",
  hasta: "2026-10-31",
  sucursalId: null,
  tipoContribuyente: "persona_natural",
  columnas: [
    { id: "capital", titulo: "Capital" },
    { id: "utilidades", titulo: "Utilidades" },
    { id: "retiros", titulo: "Retiros del titular" },
  ],
  renglones: [
    { id: "saldo-inicial", concepto: "Saldo inicial", valores: ["0.00", "0.00", "0.00"], total: "0.00" },
    {
      id: "aportes",
      concepto: "Aportes y cambios en el capital",
      valores: ["22500.00", "0.00", "0.00"],
      total: "22500.00",
    },
    {
      id: "resultado",
      concepto: "Resultado del período",
      valores: ["0.00", "7594.99", "0.00"],
      total: "7594.99",
    },
    {
      id: "retiros",
      concepto: "Retiros del titular",
      valores: ["0.00", "0.00", "-450.00"],
      total: "-450.00",
    },
    {
      id: "saldo-final",
      concepto: "Saldo final",
      valores: ["22500.00", "7594.99", "-450.00"],
      total: "29644.99",
    },
  ],
  patrimonioFinal: "29644.99",
  ...extra,
});

const abrir = (permisos: string[] = ["estados.ver"]) =>
  renderizar(<PantallaEstadosAdicionales parametros={{ empresaId: E }} />, { permisos: permisos as never });

describe("estado de cambios en el patrimonio (S3-T20, HU-40)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("consulta el mes en curso y muestra saldo inicial, movimientos y saldo final por columna", async () => {
    const peticiones = simularApi({ ...BASE, [PATRIMONIO]: { cuerpo: estado() } });
    abrir();

    const tabla = await screen.findByRole("table");
    const encabezados = within(tabla)
      .getAllByRole("columnheader")
      .map((c) => c.textContent);
    expect(encabezados).toEqual([
      "Concepto",
      "Capital",
      "Utilidades",
      "Retiros del titular",
      "Total patrimonio",
    ]);
    expect(
      within(tabla)
        .getAllByRole("row")
        .slice(1)
        .map((f) => f.textContent),
    ).toEqual([
      "Saldo inicial0.000.000.000.00",
      "Aportes y cambios en el capital22,500.000.000.0022,500.00",
      "Resultado del período0.007,594.990.007,594.99",
      "Retiros del titular0.000.00(450.00)(450.00)",
      "Saldo final22,500.007,594.99(450.00)29,644.99",
    ]);
    expect(
      Object.fromEntries(peticiones.find((p) => p.ruta.endsWith("/cambios-patrimonio"))!.consulta),
    ).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(
      screen.getByText("Coincide con el patrimonio del balance general: US$ 29,644.99."),
    ).toBeInTheDocument();
  });

  it("para una sociedad muestra sus columnas y la nota de reservas y dividendos", async () => {
    simularApi({
      ...BASE,
      [PATRIMONIO]: {
        cuerpo: estado({
          tipoContribuyente: "sociedad",
          columnas: [
            { id: "capital", titulo: "Capital social" },
            { id: "reservas", titulo: "Reservas" },
            { id: "utilidades", titulo: "Utilidades" },
          ],
          renglones: [
            {
              id: "saldo-inicial",
              concepto: "Saldo inicial",
              valores: ["100.00", "0.00", "0.00"],
              total: "100.00",
            },
            {
              id: "saldo-final",
              concepto: "Saldo final",
              valores: ["100.00", "0.00", "0.00"],
              total: "100.00",
            },
          ],
          patrimonioFinal: "100.00",
        }),
      },
    });
    abrir();

    expect(await screen.findByRole("columnheader", { name: "Capital social" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Reservas" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Retiros del titular" })).not.toBeInTheDocument();
    expect(screen.getByText(/La reserva legal se separa de las utilidades/)).toBeInTheDocument();
  });

  it("filtra por sucursal y período enviándolos a la API", async () => {
    const peticiones = simularApi({
      ...BASE,
      [`GET /empresas/${E}/sucursales`]: {
        cuerpo: [
          {
            id: "s1",
            empresaId: E,
            nombre: "Casa matriz",
            codigoEstablecimiento: "M001",
            codigoPuntoVenta: "0001",
            direccion: null,
            esMatriz: true,
            activa: true,
            creadoEn: "2026-10-01T00:00:00.000Z",
            actualizadoEn: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
      [PATRIMONIO]: { cuerpo: estado() },
    });
    const { usuario } = abrir();
    await screen.findByRole("table");
    await usuario.selectOptions(await screen.findByLabelText("Sucursal"), "s1");
    await waitFor(() => expect(peticiones.some((p) => p.consulta.get("sucursalId") === "s1")).toBe(true));
  });

  it("exporta el estado con las firmas de la empresa", async () => {
    simularApi({ ...BASE, [PATRIMONIO]: { cuerpo: estado() } });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Exportar con firmas" }));
    const dialogo = screen.getByRole("dialog", { name: "Exportar estado de cambios en el patrimonio" });
    expect(within(dialogo).getByRole("textbox", { name: "Propietario o representante legal" })).toHaveValue(
      "Carlos Hernández",
    );
  });

  it("el documento exportable lleva una columna por rubro, el total y el saldo final resaltado", () => {
    const doc = documentoCambiosPatrimonio(estado());
    expect(doc.columnas.map((c) => c.titulo)).toEqual([
      "Capital",
      "Utilidades",
      "Retiros del titular",
      "Total patrimonio",
    ]);
    expect(doc.filas.at(-1)).toMatchObject({
      texto: "Saldo final",
      valores: ["22500.00", "7594.99", "-450.00", "29644.99"],
      tipo: "resultado",
    });
    expect(doc.periodo).toBe("Del 01/10/2026 al 31/10/2026");
    expect(doc.nombreArchivo).toBe("estado-cambios-patrimonio-2026-10-01-2026-10-31");
  });

  it("muestra el rechazo de la API y no ofrece reintentar un 403", async () => {
    simularApi({
      ...BASE,
      [PATRIMONIO]: { estado: 403, cuerpo: { message: "Su rol no permite consultar estados financieros." } },
    });
    abrir();
    expect(await screen.findByText(/Su rol no permite consultar estados financieros/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("no consulta nada sin el permiso estados.ver", () => {
    const peticiones = simularApi({});
    abrir([]);
    expect(screen.getByText("Tu rol no permite consultar este reporte.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });
});
