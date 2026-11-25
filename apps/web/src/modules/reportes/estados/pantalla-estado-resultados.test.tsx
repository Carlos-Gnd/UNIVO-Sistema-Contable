import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { EstadoResultados, SeccionEstado } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { filasEstadoResultados } from "./filas-estado-resultados";
import { PantallaEstadoResultados } from "./pantalla-estado-resultados";

const E = "e1";
const RESULTADOS = `GET /empresas/${E}/estados/resultados`;
const BASE = {
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
        creadoEn: "2026-11-01T00:00:00.000Z",
        actualizadoEn: "2026-11-01T00:00:00.000Z",
      },
    ],
  },
  [`GET /empresas/${E}`]: { cuerpo: { id: E, nombre: "CheroPhonex S.A. de C.V.", nombreComercial: null } },
};

const seccion = (titulo: string, renglones: [string, string, string][], total: string): SeccionEstado => ({
  titulo,
  renglones: renglones.map(([codigo, nombre, monto]) => ({ codigo, nombre, monto })),
  total,
});

const estado = (extra: Partial<EstadoResultados> = {}): EstadoResultados => ({
  formato: "clase",
  titulo: "Estado de resultados",
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  ventas: seccion(
    "Ventas",
    [
      ["4101", "Ventas netas", "1000.00"],
      ["4102", "Devoluciones", "-50.00"],
    ],
    "950.00",
  ),
  costoVentas: seccion("Costo de ventas", [["5101", "Costo de ventas", "400.00"]], "400.00"),
  utilidadBruta: "550.00",
  gastosOperacion: seccion("Gastos de operación", [["5201", "Sueldos", "200.00"]], "200.00"),
  utilidadOperacion: "350.00",
  otrosIngresos: seccion("Otros ingresos", [], "0.00"),
  otrosGastos: seccion("Otros gastos", [], "0.00"),
  utilidadAntesImpuesto: "350.00",
  impuestoRenta: seccion("Impuesto sobre la renta", [["4204", "ISR corriente", "105.00"]], "105.00"),
  utilidadNeta: "245.00",
  ...extra,
});

const abrir = (permisos: string[] = ["estados.ver"]) =>
  renderizar(<PantallaEstadoResultados parametros={{ empresaId: E }} />, { permisos: permisos as never });

describe("estado de resultados (S2-T43, HU-37)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("muestra el estado en orden, con los resultados y el monto de cada cuenta", async () => {
    const peticiones = simularApi({ ...BASE, [RESULTADOS]: { cuerpo: estado() } });
    abrir();

    expect(await screen.findByText("4101 · Ventas netas")).toBeInTheDocument();
    const consulta = peticiones.find((p) => p.ruta.endsWith("/estados/resultados"));
    expect(consulta?.consulta.get("desde")).toBe("2026-11-01");
    expect(consulta?.consulta.get("hasta")).toBe("2026-11-30");

    const filas = screen.getAllByRole("row").map((f) => f.textContent);
    expect(filas).toEqual([
      "ConceptoUS$",
      "Ventas",
      "4101 · Ventas netas1,000.00",
      "4102 · Devoluciones(50.00)",
      "Total ventas950.00",
      "(−) Costo de ventas",
      "5101 · Costo de ventas400.00",
      "Total costo de ventas400.00",
      "Utilidad bruta550.00",
      "(−) Gastos de operación",
      "5201 · Sueldos200.00",
      "Total gastos de operación200.00",
      "Utilidad de operación350.00",
      "Utilidad antes del impuesto350.00",
      "(−) Impuesto sobre la renta",
      "4204 · ISR corriente105.00",
      "Total impuesto sobre la renta105.00",
      "Utilidad neta245.00",
    ]);
  });

  it("abre la exportación Excel con los datos del estado cargado", async () => {
    simularApi({ ...BASE, [RESULTADOS]: { cuerpo: estado() } });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Exportar con firmas" }));

    expect(screen.getByRole("dialog", { name: "Exportar estado de resultados" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Excel" })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("dialog")).getByText(/CheroPhonex S\.A\. de C\.V\./)).toBeInTheDocument();
  });

  it("cambia al formato NIIF para las PYMES con las mismas cifras y otros nombres (HU-42)", async () => {
    const niif = estado({
      formato: "niif_pymes",
      titulo: "Estado del resultado integral",
      ventas: seccion("Ingresos de actividades ordinarias", [["4101", "Ventas netas", "1000.00"]], "1000.00"),
    });
    const peticiones = simularApi({
      ...BASE,
      [RESULTADOS]: ({ consulta }) => ({
        cuerpo: consulta.get("formato") === "niif_pymes" ? niif : estado(),
      }),
    });
    const { usuario } = abrir();

    await screen.findByText("4101 · Ventas netas");
    expect(screen.getByLabelText("Formato de presentación")).toHaveValue("clase");
    expect(screen.getByRole("heading", { name: "Estado de resultados", level: 1 })).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText("Formato de presentación"), "niif_pymes");
    await waitFor(() =>
      expect(peticiones.some((p) => p.consulta.get("formato") === "niif_pymes")).toBe(true),
    );
    expect(await screen.findByText("Ingresos de actividades ordinarias")).toBeInTheDocument();
    expect(screen.getByText("Ganancia bruta")).toBeInTheDocument();
    expect(screen.getByText("Ganancia del período y resultado integral total")).toBeInTheDocument();
    expect(
      screen.getByText("Ganancia del período y resultado integral total").closest("tr"),
    ).toHaveTextContent("245.00");
    expect(
      screen.getByRole("heading", { name: "Estado del resultado integral", level: 1 }),
    ).toBeInTheDocument();
  });

  it("rotula como pérdida neta un resultado negativo", () => {
    const filas = filasEstadoResultados(estado({ utilidadNeta: "-12.50" }));
    expect(filas.at(-1)).toMatchObject({ texto: "Pérdida neta", monto: "-12.50" });
  });

  it("filtra por sucursal enviando sucursalId", async () => {
    const peticiones = simularApi({ ...BASE, [RESULTADOS]: { cuerpo: estado() } });
    const { usuario } = abrir();

    await screen.findByText("4101 · Ventas netas");
    await usuario.selectOptions(await screen.findByLabelText("Sucursal"), "s1");
    await waitFor(() => expect(peticiones.some((p) => p.consulta.get("sucursalId") === "s1")).toBe(true));
    expect(await screen.findByText(/Casa matriz · En dólares de EE\. UU\./)).toBeInTheDocument();
  });

  it("muestra el rechazo de la API", async () => {
    simularApi({
      ...BASE,
      [RESULTADOS]: {
        estado: 403,
        cuerpo: { message: "Su rol no permite consultar reportes en esta empresa." },
      },
    });
    abrir();

    expect(await screen.findByText(/Su rol no permite consultar reportes/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("no ofrece el estado sin el permiso estados.ver", () => {
    const peticiones = simularApi({});
    abrir([]);

    expect(screen.getByText("Tu rol no permite consultar este reporte.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });
});
