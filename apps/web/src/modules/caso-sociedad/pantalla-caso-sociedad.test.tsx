import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { DetalleIsrAnual, EstadoCambiosPatrimonio, EstadoCierreAnual } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaCasoSociedad } from "./pantalla-caso-sociedad";

const E = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CIERRE = `GET /empresas/${E}/cierre-anual`;
const PATRIMONIO = `GET /empresas/${E}/estados/cambios-patrimonio`;
const CON_ESTADOS: CodigoPermiso[] = ["declaraciones.ver", "estados.ver"];
const SIN_ESTADOS: CodigoPermiso[] = ["declaraciones.ver"];

// Cifras del caso de sociedad (S4-T40): utilidad 9,000, capital 10,000 y tasa del 30 %
const detalle: DetalleIsrAnual = {
  utilidadAntesImpuesto: "9000.00",
  baseImponible: "9000.00",
  impuestoDeterminado: "2700.00",
  pagosACuenta: "0.00",
  pagosAplicados: "0.00",
  impuestoPendiente: "2700.00",
  saldoAFavor: "0.00",
  utilidadDespuesDeImpuesto: "6300.00",
  capitalSocial: "10000.00",
  reservaLegalActual: "0.00",
  limiteReservaLegal: "2000.00",
  reservaLegalDisponible: "2000.00",
  reservaLegalAProvisionar: "441.00",
  tramoAplicado: null,
  tasaAplicada: "30.00",
};

const estadoSociedad = (extra: Partial<EstadoCierreAnual> = {}): EstadoCierreAnual => ({
  ejercicioId: "ej-2026",
  anio: 2026,
  tipoContribuyente: "sociedad",
  periodos: [],
  validaciones: {
    sinBorradores: { ok: true, cantidad: 0 },
    periodosListos: { ok: true, cerrados: 12, total: 12, mesesAbiertos: [] },
    partidasCuadradas: { ok: true, cantidad: 0 },
    balanza: { ok: true, debe: "0.00", haber: "0.00", diferencia: "0.00" },
  },
  listoParaIsr: true,
  permisoGenerar: false,
  permisoCerrar: false,
  permisoReabrir: false,
  todasSucursales: true,
  ejercicioCerrado: true,
  ejercicioSiguiente: null,
  configuracionIsr: null,
  detalleIsr: detalle,
  partidaIsr: null,
  vistaCierre: null,
  partidaCierre: {
    id: "pc",
    estado: "contabilizada",
    fecha: "2026-12-31",
    lineas: [
      { codigo: "3103", nombre: "Reserva legal", debe: "0.00", haber: "441.00" },
      { codigo: "3106", nombre: "Utilidades acumuladas", debe: "441.00", haber: "0.00" },
    ],
  },
  vistaReapertura: null,
  partidaReapertura: {
    id: "pr",
    estado: "borrador",
    fecha: "2027-01-01",
    lineas: [
      { codigo: "3101", nombre: "Capital social", debe: "0.00", haber: "10000.00" },
      { codigo: "3103", nombre: "Reserva legal", debe: "0.00", haber: "441.00" },
      { codigo: "3106", nombre: "Utilidades acumuladas", debe: "0.00", haber: "5859.00" },
    ],
  },
  ...extra,
});

const patrimonio: EstadoCambiosPatrimonio = {
  formato: "clase",
  titulo: "Estado de cambios en el patrimonio",
  desde: "2026-01-01",
  hasta: "2026-12-31",
  sucursalId: null,
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
      valores: ["10000.00", "0.00", "0.00"],
      total: "10000.00",
    },
    {
      id: "reservas",
      concepto: "Reserva legal del ejercicio",
      valores: ["0.00", "441.00", "-441.00"],
      total: "0.00",
    },
    {
      id: "resultado",
      concepto: "Resultado del período",
      valores: ["0.00", "0.00", "6300.00"],
      total: "6300.00",
    },
    {
      id: "saldo-final",
      concepto: "Saldo final",
      valores: ["10000.00", "441.00", "5859.00"],
      total: "16300.00",
    },
  ],
  patrimonioFinal: "16300.00",
};

describe("caso de una sociedad (HU-91, S4-T41)", () => {
  it("muestra el cálculo hasta la reserva legal con las cifras del caso", async () => {
    simularApi({ [CIERRE]: { cuerpo: estadoSociedad() }, [PATRIMONIO]: { cuerpo: patrimonio } });
    renderizar(<PantallaCasoSociedad parametros={{ empresaId: E }} />, { permisos: CON_ESTADOS });

    const titulo = await screen.findByRole("heading", { name: "De la utilidad a la reserva legal" });
    const tarjeta = titulo.parentElement!.parentElement!;
    const monto = (etiqueta: string) => within(tarjeta).getByText(etiqueta).nextElementSibling?.textContent;
    expect(monto("Utilidad antes de impuesto")).toBe("US$ 9,000.00");
    expect(monto("Impuesto sobre la renta (30.00 %)")).toBe("US$ 2,700.00");
    expect(monto("Utilidad después de impuesto")).toBe("US$ 6,300.00");
    expect(monto("Capital social")).toBe("US$ 10,000.00");
    expect(monto("Límite de la reserva legal (20 % del capital social)")).toBe("US$ 2,000.00");
    expect(monto("Reserva legal constituida")).toBe("US$ 0.00");
    expect(
      monto("Reserva legal del ejercicio (7 % de la utilidad después de impuesto, hasta el límite)"),
    ).toBe("US$ 441.00");
  });

  it("muestra la partida de cierre contabilizada y la de reapertura en borrador", async () => {
    simularApi({ [CIERRE]: { cuerpo: estadoSociedad() }, [PATRIMONIO]: { cuerpo: patrimonio } });
    renderizar(<PantallaCasoSociedad parametros={{ empresaId: E }} />, { permisos: CON_ESTADOS });

    const cierre = await screen.findByRole("region", { name: "Partida de cierre" });
    expect(within(cierre).getByText("Contabilizada")).toBeInTheDocument();
    expect(within(cierre).getByText("Reserva legal")).toBeInTheDocument();
    const reapertura = screen.getByRole("region", { name: "Partida de reapertura" });
    expect(within(reapertura).getByText("Borrador")).toBeInTheDocument();
    expect(within(reapertura).getByText("Capital social")).toBeInTheDocument();
    expect(screen.getByText("Ejercicio cerrado")).toBeInTheDocument();
  });

  it("muestra el estado de cambios en el patrimonio con el saldo final", async () => {
    const peticiones = simularApi({
      [CIERRE]: { cuerpo: estadoSociedad() },
      [PATRIMONIO]: { cuerpo: patrimonio },
    });
    renderizar(<PantallaCasoSociedad parametros={{ empresaId: E }} />, { permisos: CON_ESTADOS });

    expect(await screen.findByRole("columnheader", { name: "Capital social" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Saldo final" })).toBeInTheDocument();
    expect(screen.getByText("US$ 16,300.00", { selector: "strong" })).toBeInTheDocument();
    const consulta = peticiones.find((p) => p.ruta.endsWith("/cambios-patrimonio"))!;
    expect(Object.fromEntries(consulta.consulta)).toMatchObject({ desde: "2026-01-01", hasta: "2026-12-31" });
  });

  it("sin el permiso de estados no consulta el patrimonio", async () => {
    const peticiones = simularApi({ [CIERRE]: { cuerpo: estadoSociedad() } });
    renderizar(<PantallaCasoSociedad parametros={{ empresaId: E }} />, { permisos: SIN_ESTADOS });

    await screen.findByRole("heading", { name: "De la utilidad a la reserva legal" });
    expect(peticiones.some((p) => p.ruta.endsWith("/cambios-patrimonio"))).toBe(false);
    expect(screen.queryByText("Estado de cambios en el patrimonio")).not.toBeInTheDocument();
  });

  it("una persona natural ve que el caso aplica a sociedades", async () => {
    simularApi({
      [CIERRE]: { cuerpo: estadoSociedad({ tipoContribuyente: "persona_natural", detalleIsr: null }) },
    });
    renderizar(<PantallaCasoSociedad parametros={{ empresaId: E }} />, { permisos: CON_ESTADOS });

    expect(await screen.findByText(/El caso aplica a sociedades/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "De la utilidad a la reserva legal" }),
    ).not.toBeInTheDocument();
  });

  it("si todavía no se calculó el impuesto lo indica y lleva al cierre", async () => {
    simularApi({
      [CIERRE]: {
        cuerpo: estadoSociedad({
          detalleIsr: null,
          partidaCierre: null,
          partidaReapertura: null,
          ejercicioCerrado: false,
        }),
      },
      [PATRIMONIO]: { cuerpo: patrimonio },
    });
    const { usuario } = renderizar(<PantallaCasoSociedad parametros={{ empresaId: E }} />, {
      permisos: CON_ESTADOS,
    });

    expect(
      await screen.findByText(/Todavía no se calcula el impuesto sobre la renta del ejercicio 2026/),
    ).toBeInTheDocument();
    expect(screen.getByText("Ejercicio abierto")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Ir al cierre del ejercicio" }));
    expect(window.location.pathname).toBe(`/empresas/${E}/cierre`);
  });

  it("permite reintentar si falla la carga y cambia de ejercicio", async () => {
    let intentos = 0;
    const peticiones = simularApi({
      [CIERRE]: () =>
        ++intentos === 1 ? { estado: 500, cuerpo: { mensaje: "falló" } } : { cuerpo: estadoSociedad() },
      [PATRIMONIO]: { cuerpo: patrimonio },
    });
    const { usuario } = renderizar(<PantallaCasoSociedad parametros={{ empresaId: E }} />, {
      permisos: CON_ESTADOS,
    });

    await usuario.click(await screen.findByRole("button", { name: "Reintentar" }));
    await screen.findByRole("heading", { name: "De la utilidad a la reserva legal" });
    await usuario.selectOptions(screen.getByLabelText("Ejercicio"), "2025");
    await waitFor(() =>
      expect(
        peticiones.some((p) => p.ruta.endsWith("/cierre-anual") && p.consulta.get("anio") === "2025"),
      ).toBe(true),
    );
  });
});
