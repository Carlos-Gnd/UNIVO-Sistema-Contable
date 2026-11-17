import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaPeriodos } from "./pantalla-periodos";
import { ejercicioInicial } from "./periodos-api";
import type { EjercicioDetalle } from "./tipos";

const E = "e1";
const LISTA = `GET /empresas/${E}/ejercicios`;
const ADMIN: CodigoPermiso[] = ["empresa.ver", "empresa.configurar"];
const CONTADOR: CodigoPermiso[] = ["empresa.ver", "periodos.cerrar"];

const ULTIMO_DIA = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dos = (n: number) => String(n).padStart(2, "0");

/** Ejercicio con sus 12 períodos; los meses en `cerrados` quedan cerrados. */
function ejercicio(anio: number, cerrados: number[] = []): EjercicioDetalle {
  return {
    id: `ej-${anio}`,
    anio,
    fechaInicio: `${anio}-01-01`,
    fechaFin: `${anio}-12-31`,
    estado: "abierto",
    periodos: ULTIMO_DIA.map((dias, i) => ({
      id: `${anio}-${i + 1}`,
      mes: i + 1,
      fechaInicio: `${anio}-${dos(i + 1)}-01`,
      fechaFin: `${anio}-${dos(i + 1)}-${dos(dias)}`,
      estado: cerrados.includes(i + 1) ? "cerrado" : "abierto",
      cerradoEn: cerrados.includes(i + 1) ? `${anio}-${dos(i + 2)}-05T10:00:00.000Z` : null,
      motivoReapertura: null,
    })),
  };
}

const abrir = (permisos: CodigoPermiso[] = ADMIN) =>
  renderizar(<PantallaPeriodos parametros={{ empresaId: E }} />, { permisos });

describe("ejercicios y períodos (S1-T75)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("muestra el ejercicio del año en curso con sus doce períodos y su estado", async () => {
    simularApi({
      [LISTA]: {
        cuerpo: [ejercicio(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), ejercicio(2026, [1, 2, 3])],
      },
    });
    abrir();

    const panel = await screen.findByRole("tabpanel", { name: "Ejercicio 2026" });
    expect(screen.getByRole("tab", { name: "Ejercicio 2026" })).toHaveAttribute("aria-selected", "true");
    const meses = within(panel).getAllByRole("listitem");
    expect(meses).toHaveLength(12);
    expect(meses[0]).toHaveTextContent("Enero01/01/2026 – 31/01/2026Cerrado");
    expect(meses[0]).toHaveTextContent("Cerrado el 05/02/2026");
    expect(meses[3]).toHaveTextContent("Abril01/04/2026 – 30/04/2026Abierto");
    expect(meses[10]).toHaveTextContent("Período actual");
    expect(within(meses[10]!).getByText("Noviembre").closest("section")).toHaveAttribute(
      "aria-current",
      "date",
    );
  });

  it("cambia de ejercicio con clic y con las flechas del teclado", async () => {
    simularApi({ [LISTA]: { cuerpo: [ejercicio(2026), ejercicio(2025, [12])] } });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("tab", { name: "Ejercicio 2025" }));
    expect(screen.getByRole("tabpanel", { name: "Ejercicio 2025" })).toHaveTextContent(
      "Diciembre01/12/2025 – 31/12/2025Cerrado",
    );

    await usuario.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Ejercicio 2026" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Ejercicio 2026" })).toBeInTheDocument();
  });

  it("crea el ejercicio del año siguiente y lo muestra", async () => {
    let lista = [ejercicio(2026)];
    const peticiones = simularApi({
      [LISTA]: () => ({ cuerpo: lista }),
      [`POST /empresas/${E}/ejercicios`]: () => {
        lista = [...lista, ejercicio(2027)];
        return { estado: 201, cuerpo: ejercicio(2027) };
      },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Crear ejercicio" }));
    const dialogo = screen.getByRole("dialog", { name: "Crear ejercicio" });
    expect(within(dialogo).getByLabelText("Año")).toHaveValue("2027");
    expect(within(dialogo).getAllByRole("listitem")).toHaveLength(12);
    await usuario.click(within(dialogo).getByRole("button", { name: "Crear ejercicio 2027" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Ejercicio 2027" })).toHaveAttribute("aria-selected", "true");
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
      anio: 2027,
      fechaInicio: "2027-01-01",
      fechaFin: "2027-12-31",
    });
  });

  it("valida el año en español y no repite ejercicios", async () => {
    const peticiones = simularApi({ [LISTA]: { cuerpo: [ejercicio(2026)] } });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Crear ejercicio" }));
    const anio = screen.getByLabelText("Año");

    await usuario.clear(anio);
    await usuario.type(anio, "1999");
    await usuario.click(screen.getByRole("button", { name: "Crear ejercicio 1999" }));
    expect(anio).toHaveAccessibleDescription("Escribe un año de cuatro dígitos entre 2000 y 2100.");

    await usuario.clear(anio);
    await usuario.type(anio, "2026");
    await usuario.click(screen.getByRole("button", { name: "Crear ejercicio 2026" }));
    expect(anio).toHaveAccessibleDescription("El ejercicio 2026 ya existe.");
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("muestra el rechazo de la API en el campo del año", async () => {
    simularApi({
      [LISTA]: { cuerpo: [] },
      [`POST /empresas/${E}/ejercicios`]: {
        estado: 409,
        cuerpo: { message: "Ya existe el ejercicio 2026." },
      },
    });
    const { usuario } = abrir();

    expect(await screen.findByText("Aún no hay ejercicios")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Crear ejercicio" }));
    expect(screen.getByLabelText("Año")).toHaveValue("2026");
    await usuario.click(screen.getByRole("button", { name: "Crear ejercicio 2026" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Año")).toHaveAccessibleDescription("Ya existe el ejercicio 2026."),
    );
  });

  it("sin permiso de administrador no se ofrece crear ejercicios", async () => {
    simularApi({ [LISTA]: { cuerpo: [] } });
    abrir(CONTADOR);

    expect(
      await screen.findByText("El administrador debe crear el ejercicio para empezar a registrar partidas."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear ejercicio" })).not.toBeInTheDocument();
  });
});

describe("ejercicioInicial", () => {
  it("elige el año en curso o, si no existe, el más reciente", () => {
    expect(ejercicioInicial([ejercicio(2025), ejercicio(2026)], 2026)).toBe(2026);
    expect(ejercicioInicial([ejercicio(2024), ejercicio(2025)], 2026)).toBe(2025);
    expect(ejercicioInicial([], 2026)).toBeUndefined();
  });
});
