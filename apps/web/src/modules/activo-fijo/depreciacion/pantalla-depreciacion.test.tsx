import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { ActivoFijoVista, CuadroActivo, VistaDepreciacionMes } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { mesesDisponibles } from "./depreciacion-api";
import { PantallaDepreciacion } from "./pantalla-depreciacion";

const E = "e1";
const OCT = `GET /empresas/${E}/depreciacion`;
const GENERAR = `POST /empresas/${E}/depreciacion`;
const ACTIVOS = `GET /empresas/${E}/activos-fijos`;
const CONTADOR: CodigoPermiso[] = ["activo_fijo.ver", "activo_fijo.registrar", "ajustes.generar"];
const CONSULTA: CodigoPermiso[] = ["activo_fijo.ver"];

const fila = (extra: Partial<VistaDepreciacionMes["activos"][number]> = {}) => ({
  activoId: "a1",
  codigo: "AF-0001",
  nombre: "Mobiliario y equipo",
  sucursalId: "s1",
  costo: "2500.00",
  tasaAnual: "50.00",
  cuota: "104.17",
  acumulada: "104.17",
  valorEnLibros: "2395.83",
  estado: "pendiente" as const,
  mesPendiente: null,
  ...extra,
});
const vista = (extra: Partial<VistaDepreciacionMes> = {}): VistaDepreciacionMes => ({
  mes: "2026-10",
  activos: [fila()],
  partidas: [
    {
      sucursalId: "s1",
      sucursalNombre: "Casa matriz",
      fecha: "2026-10-31",
      concepto: "Ajuste: depreciación mensual de activos fijos · octubre de 2026",
      total: "104.17",
      lineas: [
        { cuentaId: "g", codigo: "420122", nombre: "Depreciación", debe: "104.17", haber: "0.00" },
        { cuentaId: "d", codigo: "120204", nombre: "Mobiliario y Equipo", debe: "0.00", haber: "104.17" },
      ],
    },
  ],
  totalPendiente: "104.17",
  ...extra,
});

const abrir = (permisos: CodigoPermiso[] = CONTADOR) =>
  renderizar(<PantallaDepreciacion parametros={{ empresaId: E }} />, { permisos });

/** El botón se habilita cuando llegó el cálculo del mes y hay cuotas pendientes. */
async function botonGenerarListo() {
  const boton = await screen.findByRole("button", { name: "Generar depreciación del mes" });
  await waitFor(() => expect(boton).toBeEnabled());
  return boton;
}

describe("pantalla de depreciación (S3-T131)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Octubre es el mes del caso CheroPhonex
    vi.setSystemTime(new Date(2026, 9, 31, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("muestra la cuota de US$ 104.17 del mes con su costo, acumulada y valor en libros", async () => {
    simularApi({ [OCT]: { cuerpo: vista() }, [ACTIVOS]: { cuerpo: [] } });
    abrir();

    const celda = await screen.findByRole("cell", { name: "AF-0001" });
    const filaActivo = celda.closest("tr")!;
    // la cuota y la acumulada del primer mes coinciden
    expect(within(filaActivo).getAllByText("104.17")).toHaveLength(2);
    expect(within(filaActivo).getByText("2,395.83")).toBeInTheDocument();
    expect(within(filaActivo).getByText("50.00 %")).toBeInTheDocument();
    expect(within(filaActivo).getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByLabelText("Mes")).toHaveValue("2026-10");
  });

  it("pide la vista del mes elegido", async () => {
    const peticiones = simularApi({ [OCT]: { cuerpo: vista() }, [ACTIVOS]: { cuerpo: [] } });
    const { usuario } = abrir();

    await screen.findByRole("cell", { name: "AF-0001" });
    await usuario.selectOptions(screen.getByLabelText("Mes"), "2026-09");
    await waitFor(() =>
      expect(
        peticiones.some((p) => p.ruta.endsWith("/depreciacion") && p.consulta.get("mes") === "2026-09"),
      ).toBe(true),
    );
  });

  it("genera la depreciación: muestra la partida, confirma y refresca", async () => {
    const peticiones = simularApi({
      [OCT]: { cuerpo: vista() },
      [ACTIVOS]: { cuerpo: [] },
      [GENERAR]: {
        estado: 201,
        cuerpo: {
          mes: "2026-10",
          partidas: [
            { sucursalId: "s1", partida: { id: "p1", numero: 37, ambito: "2026" }, total: "104.17" },
          ],
          total: "104.17",
        },
      },
    });
    const { usuario } = abrir();

    await usuario.click(await botonGenerarListo());
    const dialogo = await screen.findByRole("dialog", { name: "Generar la depreciación del mes" });
    expect(within(dialogo).getByText(/420122/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/120204/)).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar y contabilizar" }));

    await waitFor(() =>
      expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({ mes: "2026-10" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("si la API rechaza la partida (período cerrado) muestra el motivo y deja el diálogo abierto", async () => {
    simularApi({
      [OCT]: { cuerpo: vista() },
      [ACTIVOS]: { cuerpo: [] },
      [GENERAR]: { estado: 422, cuerpo: { message: "El período está cerrado" } },
    });
    const { usuario } = abrir();

    await usuario.click(await botonGenerarListo());
    const dialogo = await screen.findByRole("dialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar y contabilizar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/cerrado/);
  });

  it("con el mes ya generado el botón queda desactivado y se marca la partida", async () => {
    simularApi({
      [OCT]: {
        cuerpo: vista({ activos: [fila({ estado: "generada" })], partidas: [], totalPendiente: "0.00" }),
      },
      [ACTIVOS]: { cuerpo: [] },
    });
    abrir();

    expect(await screen.findByText("Partida generada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar depreciación del mes" })).toBeDisabled();
  });

  it("avisa qué mes falta cuando un activo tiene meses anteriores sin depreciar", async () => {
    simularApi({
      [OCT]: {
        cuerpo: vista({
          activos: [fila({ estado: "bloqueada", mesPendiente: "2026-09-01" })],
          partidas: [],
          totalPendiente: "0.00",
        }),
      },
      [ACTIVOS]: { cuerpo: [] },
    });
    abrir();

    expect(await screen.findByText("Falta Septiembre 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar depreciación del mes" })).toBeDisabled();
  });

  it("quien solo consulta ve el cálculo pero no el botón de generar", async () => {
    simularApi({ [OCT]: { cuerpo: vista() }, [ACTIVOS]: { cuerpo: [] } });
    abrir(CONSULTA);

    await screen.findByRole("cell", { name: "AF-0001" });
    expect(screen.queryByRole("button", { name: "Generar depreciación del mes" })).not.toBeInTheDocument();
  });

  it("el cuadro del activo lista los meses de su vida útil y marca los generados", async () => {
    const activo = {
      id: "a1",
      codigo: "AF-0001",
      nombre: "Mobiliario y equipo",
      estado: "activo",
      tasaAnual: "50.00",
    } as ActivoFijoVista;
    const cuadro: CuadroActivo = {
      activo,
      filas: [
        {
          mes: "2026-10-01",
          cuota: "104.17",
          acumulada: "104.17",
          valorEnLibros: "2395.83",
          estado: "generada",
          partidaId: "p1",
        },
        {
          mes: "2026-11-01",
          cuota: "104.17",
          acumulada: "208.34",
          valorEnLibros: "2291.66",
          estado: "pendiente",
          partidaId: null,
        },
      ],
    };
    simularApi({
      [OCT]: { cuerpo: vista() },
      [ACTIVOS]: { cuerpo: [activo] },
      [`GET /empresas/${E}/activos-fijos/a1/cuadro`]: { cuerpo: cuadro },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("tab", { name: "Cuadro del activo" }));
    expect(await screen.findByText("Cuadro de depreciación · Mobiliario y equipo")).toBeInTheDocument();
    const octubre = screen.getByRole("cell", { name: "Octubre 2026" }).closest("tr")!;
    expect(within(octubre).getByText("Generada")).toBeInTheDocument();
    const noviembre = screen.getByRole("cell", { name: "Noviembre 2026" }).closest("tr")!;
    expect(within(noviembre).getByText("Pendiente")).toBeInTheDocument();
    expect(within(noviembre).getByText("208.34")).toBeInTheDocument();
  });
});

describe("meses disponibles", () => {
  it("van del mes actual hacia atrás cruzando el año", () => {
    expect(mesesDisponibles("2026-02-10", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
});
