import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoResultados } from "@contable/shared";

const { crearExcelEstadoResultados, descargarExcelEstadoResultados } = vi.hoisted(() => ({
  crearExcelEstadoResultados: vi.fn(),
  descargarExcelEstadoResultados: vi.fn(),
}));

vi.mock("./estado-resultados-excel", () => ({ crearExcelEstadoResultados, descargarExcelEstadoResultados }));

import { ExportarEstadoResultados } from "./exportar-estado-resultados";
import { crearDocumentoEstadoResultados } from "./estado-resultados-pdf";

const estado: EstadoResultados = {
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  ventas: {
    titulo: "Ventas",
    renglones: [{ codigo: "5101", nombre: "Ventas", monto: "1000.00" }],
    total: "1000.00",
  },
  costoVentas: { titulo: "Costo de ventas", renglones: [], total: "0.00" },
  utilidadBruta: "1000.00",
  gastosOperacion: { titulo: "Gastos de operación", renglones: [], total: "0.00" },
  utilidadOperacion: "1000.00",
  otrosIngresos: { titulo: "Otros ingresos", renglones: [], total: "0.00" },
  otrosGastos: { titulo: "Otros gastos", renglones: [], total: "0.00" },
  utilidadAntesImpuesto: "1000.00",
  impuestoRenta: { titulo: "Impuesto sobre la renta", renglones: [], total: "0.00" },
  utilidadNeta: "1000.00",
};

describe("exportación del estado de resultados (S2-T44)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crearExcelEstadoResultados.mockResolvedValue(new Blob(["xlsx"]));
  });

  it("abre el diálogo de firmas y descarga Excel con el alcance y los nombres indicados", async () => {
    const usuario = userEvent.setup();
    render(
      <ExportarEstadoResultados estado={estado} empresa="CheroPhonex, S.A. de C.V." alcance="Consolidado" />,
    );

    await usuario.click(screen.getByRole("button", { name: "Exportar con firmas" }));
    expect(screen.getByRole("dialog", { name: "Exportar estado de resultados" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Excel" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/CheroPhonex, S\.A\. de C\.V\./)).toBeInTheDocument();

    await usuario.type(
      screen.getByRole("textbox", { name: "Propietario o representante legal" }),
      "Carlos Hernández",
    );
    await usuario.type(screen.getByRole("textbox", { name: "Contador" }), "María Rivas");
    await usuario.click(screen.getByRole("button", { name: "Exportar en Excel" }));

    await waitFor(() =>
      expect(crearExcelEstadoResultados).toHaveBeenCalledWith(estado, {
        empresa: "CheroPhonex, S.A. de C.V.",
        alcance: "Consolidado",
        propietario: "Carlos Hernández",
        contador: "María Rivas",
        incluirFirmas: true,
      }),
    );
    expect(descargarExcelEstadoResultados).toHaveBeenCalledWith(expect.any(Blob), estado);
  });

  it("omite los campos de firma cuando se desmarca la casilla", async () => {
    const usuario = userEvent.setup();
    render(<ExportarEstadoResultados estado={estado} empresa="CheroPhonex" alcance="Consolidado" />);
    await usuario.click(screen.getByRole("button", { name: "Exportar con firmas" }));
    await usuario.click(screen.getByLabelText("Incluir espacios de firma"));

    expect(
      screen.queryByRole("textbox", { name: "Propietario o representante legal" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Representante legal")).not.toBeInTheDocument();
  });

  it("escapa los datos de empresa y los nombres en el documento imprimible", () => {
    const documento = crearDocumentoEstadoResultados(estado, {
      empresa: "Chero <Phonex>",
      alcance: "Consolidado",
      propietario: "Ana & Luis",
      contador: "",
      incluirFirmas: true,
    });

    expect(documento).toContain("Chero &lt;Phonex&gt;");
    expect(documento).toContain("Ana &amp; Luis");
    expect(documento).not.toContain("Chero <Phonex>");
  });

  it("formatea los montos del PDF con separador de miles y pérdidas entre paréntesis", () => {
    const estadoConPerdida: EstadoResultados = {
      ...estado,
      ventas: {
        ...estado.ventas,
        renglones: [{ codigo: "5101", nombre: "Ventas netas", monto: "46051.20" }],
        total: "46051.20",
      },
      utilidadNeta: "-7594.99",
    };
    const documento = crearDocumentoEstadoResultados(estadoConPerdida, {
      empresa: "CheroPhonex",
      alcance: "Consolidado",
      propietario: "",
      contador: "",
      incluirFirmas: false,
    });

    expect(documento).toContain(">46,051.20</td>");
    expect(documento).toContain(">(7,594.99)</td>");
    expect(documento).not.toContain("46051.20");
    expect(documento).not.toContain("-7594.99");
  });
});
