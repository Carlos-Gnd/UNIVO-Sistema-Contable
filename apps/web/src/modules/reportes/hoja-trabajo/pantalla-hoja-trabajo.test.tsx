import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { HojaTrabajo, LineaHojaTrabajo } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaHojaTrabajo } from "./pantalla-hoja-trabajo";

const E = "e1";
const SUCURSALES = `GET /empresas/${E}/sucursales`;
const EMPRESA = `GET /empresas/${E}`;
const HOJA = `GET /empresas/${E}/hoja-trabajo`;

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

const CEROS = {
  balanzaDebe: "0.00",
  balanzaHaber: "0.00",
  ajustesDebe: "0.00",
  ajustesHaber: "0.00",
  balanzaAjustadaDebe: "0.00",
  balanzaAjustadaHaber: "0.00",
  estadoResultadosDebe: "0.00",
  estadoResultadosHaber: "0.00",
  balanceGeneralDebe: "0.00",
  balanceGeneralHaber: "0.00",
};

const linea = (extra: Partial<LineaHojaTrabajo>): LineaHojaTrabajo => ({
  cuentaId: "c",
  codigo: "",
  nombre: "",
  tipoCuenta: null,
  resultado: null,
  ...CEROS,
  ...extra,
});

/** Una caja con 1,200.50, un capital de 1,000.00 y una venta de 200.50: utilidad de 200.50. */
const hoja = (extra: Partial<HojaTrabajo> = {}): HojaTrabajo => ({
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  lineas: [
    linea({
      cuentaId: "c1",
      codigo: "110101",
      nombre: "Caja general",
      tipoCuenta: "activo",
      balanzaDebe: "1200.50",
      balanzaAjustadaDebe: "1200.50",
      balanceGeneralDebe: "1200.50",
    }),
    linea({
      cuentaId: "c2",
      codigo: "310101",
      nombre: "Capital social",
      tipoCuenta: "patrimonio",
      balanzaHaber: "1000.00",
      balanzaAjustadaHaber: "1000.00",
      balanceGeneralHaber: "1000.00",
    }),
    linea({
      cuentaId: "c3",
      codigo: "410101",
      nombre: "Ventas",
      tipoCuenta: "ingresos",
      balanzaHaber: "200.50",
      balanzaAjustadaHaber: "200.50",
      estadoResultadosHaber: "200.50",
    }),
    linea({
      cuentaId: null,
      nombre: "Utilidad del ejercicio",
      resultado: "utilidad",
      estadoResultadosDebe: "200.50",
      balanceGeneralHaber: "200.50",
    }),
  ],
  totales: {
    balanzaDebe: "1200.50",
    balanzaHaber: "1200.50",
    ajustesDebe: "0.00",
    ajustesHaber: "0.00",
    balanzaAjustadaDebe: "1200.50",
    balanzaAjustadaHaber: "1200.50",
    estadoResultadosDebe: "200.50",
    estadoResultadosHaber: "200.50",
    balanceGeneralDebe: "1200.50",
    balanceGeneralHaber: "1200.50",
  },
  resultado: { tipo: "utilidad", monto: "200.50" },
  diferencias: {
    balanza: "0.00",
    ajustes: "0.00",
    balanzaAjustada: "0.00",
    estadoResultados: "0.00",
    balanceGeneral: "0.00",
  },
  cuadra: true,
  ...extra,
});

const BASE = {
  [SUCURSALES]: { cuerpo: [sucursal("s1", "Casa matriz", true), sucursal("s2", "San Miguel Centro")] },
  [EMPRESA]: { cuerpo: { id: E, nombre: "CheroPhonex S.A. de C.V.", nombreComercial: "CheroPhonex" } },
};

const abrir = (permisos: string[] = ["reportes.ver"]) =>
  renderizar(<PantallaHojaTrabajo parametros={{ empresaId: E }} />, { permisos: permisos as never });

const textos = (fila: HTMLElement) =>
  within(fila)
    .getAllByRole("cell")
    .map((c) => c.textContent);

describe("hoja de trabajo de diez columnas (S2-T34, HU-31)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("pide la hoja consolidada del mes en curso y muestra las cuentas con sus diez columnas", async () => {
    const peticiones = simularApi({ ...BASE, [HOJA]: { cuerpo: hoja() } });
    abrir();

    expect(await screen.findByText("Caja general")).toBeInTheDocument();
    const consulta = peticiones.find((p) => p.ruta.endsWith("/hoja-trabajo"));
    expect(consulta?.consulta.get("desde")).toBe("2026-11-01");
    expect(consulta?.consulta.get("hasta")).toBe("2026-11-30");
    expect(consulta?.consulta.has("sucursalId")).toBe(false);

    for (const grupo of [
      "Balanza de comprobación",
      "Ajustes",
      "Balanza ajustada",
      "Estado de resultados",
      "Balance general",
    ]) {
      expect(screen.getByRole("columnheader", { name: grupo })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("columnheader", { name: "Debe" })).toHaveLength(5);
    expect(screen.getAllByRole("columnheader", { name: "Haber" })).toHaveLength(5);

    const caja = screen.getByRole("row", { name: /Caja general/ });
    expect(textos(caja)).toEqual([
      "110101Caja general",
      "1,200.50",
      "—",
      "—",
      "—",
      "1,200.50",
      "—",
      "—",
      "—",
      "1,200.50",
      "—",
    ]);
    expect(await screen.findByText("CheroPhonex")).toBeInTheDocument();
  });

  it("cierra con «Sumas», la utilidad del ejercicio y «Sumas iguales», en ese orden", async () => {
    simularApi({ ...BASE, [HOJA]: { cuerpo: hoja() } });
    abrir();
    await screen.findByText("Caja general");

    const pie = screen.getAllByRole("rowgroup").at(-1)!;
    const filas = within(pie).getAllByRole("row");
    expect(filas.map((f) => within(f).getAllByRole("cell")[0]?.textContent)).toEqual([
      "Sumas",
      "Utilidad del ejercicio",
      "Sumas iguales",
    ]);
    // «Sumas» suma solo las cuentas: el estado de resultados aún no tiene la utilidad
    expect(textos(filas[0]!)).toEqual([
      "Sumas",
      "1,200.50",
      "1,200.50",
      "0.00",
      "0.00",
      "1,200.50",
      "1,200.50",
      "0.00",
      "200.50",
      "1,200.50",
      "1,000.00",
    ]);
    expect(textos(filas[1]!)).toEqual([
      "Utilidad del ejercicio",
      "—",
      "—",
      "—",
      "—",
      "—",
      "—",
      "200.50",
      "—",
      "—",
      "200.50",
    ]);
    expect(textos(filas[2]!)).toEqual([
      "Sumas iguales",
      "1,200.50",
      "1,200.50",
      "0.00",
      "0.00",
      "1,200.50",
      "1,200.50",
      "200.50",
      "200.50",
      "1,200.50",
      "1,200.50",
    ]);
  });

  it("indica que cuadra y explica la utilidad del período", async () => {
    simularApi({ ...BASE, [HOJA]: { cuerpo: hoja() } });
    abrir();

    expect(await screen.findByText("Las diez columnas cuadran")).toBeInTheDocument();
    expect(
      screen.getByText(/La utilidad del período es .*200\.50; con ella cuadran el estado de resultados/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con pérdida lo dice y la línea de resultado va al otro lado", async () => {
    simularApi({
      ...BASE,
      [HOJA]: {
        cuerpo: hoja({
          resultado: { tipo: "perdida", monto: "75.00" },
          lineas: [
            hoja().lineas[0]!,
            linea({
              cuentaId: null,
              nombre: "Pérdida del ejercicio",
              resultado: "perdida",
              estadoResultadosHaber: "75.00",
              balanceGeneralDebe: "75.00",
            }),
          ],
        }),
      },
    });
    abrir();

    expect(await screen.findByText(/La pérdida del período es .*75\.00/)).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Pérdida del ejercicio/ })).toBeInTheDocument();
  });

  it("avisa con las diferencias cuando la hoja no cuadra y no explica la utilidad", async () => {
    simularApi({
      ...BASE,
      [HOJA]: {
        cuerpo: hoja({
          cuadra: false,
          diferencias: {
            balanza: "0.00",
            ajustes: "0.00",
            balanzaAjustada: "5.00",
            estadoResultados: "0.00",
            balanceGeneral: "5.00",
          },
        }),
      },
    });
    abrir();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No cuadra.");
    expect(alerta).toHaveTextContent("Los totales de la balanza ajustada difieren en");
    expect(alerta).toHaveTextContent("Los totales del balance general difieren en");
    expect(alerta).not.toHaveTextContent("Los totales de la balanza de comprobación difieren");
    expect(screen.queryByText(/La utilidad del período es/)).not.toBeInTheDocument();
  });

  it("filtra por sucursal enviando sucursalId", async () => {
    const peticiones = simularApi({ ...BASE, [HOJA]: { cuerpo: hoja() } });
    const { usuario } = abrir();

    await screen.findByText("Caja general");
    await usuario.selectOptions(await screen.findByLabelText("Sucursal"), "s2");
    await waitFor(() => expect(peticiones.some((p) => p.consulta.get("sucursalId") === "s2")).toBe(true));
  });

  it("sin cuentas con movimientos muestra el aviso y las sumas en cero", async () => {
    simularApi({
      ...BASE,
      [HOJA]: {
        cuerpo: hoja({
          lineas: [],
          totales: { ...hoja().totales, balanzaDebe: "0.00", balanzaHaber: "0.00" },
          resultado: { tipo: null, monto: "0.00" },
        }),
      },
    });
    abrir();

    expect(await screen.findByText("Sin cuentas con movimientos en el período.")).toBeInTheDocument();
  });

  it("muestra el error de la API con la opción de reintentar", async () => {
    simularApi({ ...BASE, [HOJA]: { estado: 500, cuerpo: { mensaje: "Fallo interno" } } });
    abrir();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se pudo generar el reporte.");
    expect(within(alerta).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("no consulta nada sin el permiso de reportes", async () => {
    const peticiones = simularApi({ ...BASE, [HOJA]: { cuerpo: hoja() } });
    abrir([]);

    expect(await screen.findByText("Tu rol no permite consultar este reporte.")).toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta.endsWith("/hoja-trabajo"))).toBe(false);
  });
});
