import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentoEstado, EncabezadoDocumento, FirmasDocumento } from "./documento-estado";

const { crearExcel, descargarExcel } = vi.hoisted(() => ({
  crearExcel: vi.fn(),
  descargarExcel: vi.fn(),
}));

vi.mock("./documento-excel", () => ({ crearExcel, descargarExcel }));

import { crearDocumentoPdf } from "./documento-pdf";
import { ExportarEstado } from "./exportar-estado";

const documento: DocumentoEstado = {
  titulo: "Estado de resultados",
  periodo: "Del 01/11/2026 al 30/11/2026",
  columnas: [{ titulo: "US$", tipo: "dinero" }],
  filas: [
    { id: "v", texto: "Ventas", tipo: "seccion" },
    { id: "v1", texto: "5101 · Ventas netas", valores: ["46051.20"], tipo: "renglon" },
    { id: "n", texto: "Utilidad neta", valores: ["-7594.99"], tipo: "resultado" },
  ],
  nombreHoja: "Estado de resultados",
  nombreArchivo: "estado-resultados-2026-11-01-2026-11-30",
};

const empresa = {
  nombre: "CheroPhonex, S.A. de C.V.",
  nombreComercial: null,
  nit: "0614-010190-101-5",
  logoUrl: "https://ejemplo.test/logo.png",
  representanteLegal: "Carlos Hernández",
  contadorNombre: "María Rivas",
  contadorRegistro: "CVPCPA-1234",
};

const encabezado: EncabezadoDocumento = {
  empresa: "CheroPhonex",
  nit: "0614-010190-101-5",
  alcance: "Consolidado",
  logoUrl: null,
};
const firmas: FirmasDocumento = { incluir: true, propietario: "", contador: "", registroContador: "" };

describe("exportación de estados con firmas (HU-39, S3-T18)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crearExcel.mockResolvedValue(new Blob(["xlsx"]));
  });

  it("propone los nombres de las firmas guardados en la empresa y los envía al Excel", async () => {
    const usuario = userEvent.setup();
    render(<ExportarEstado documento={documento} empresa={empresa} alcance="Consolidado" />);

    await usuario.click(screen.getByRole("button", { name: "Exportar con firmas" }));
    expect(screen.getByRole("dialog", { name: "Exportar estado de resultados" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Excel" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: "Propietario o representante legal" })).toHaveValue(
      "Carlos Hernández",
    );
    expect(screen.getByRole("textbox", { name: "Contador" })).toHaveValue("María Rivas");

    await usuario.click(screen.getByRole("button", { name: "Exportar en Excel" }));
    await waitFor(() =>
      expect(crearExcel).toHaveBeenCalledWith(
        documento,
        {
          empresa: "CheroPhonex, S.A. de C.V.",
          nit: empresa.nit,
          alcance: "Consolidado",
          logoUrl: empresa.logoUrl,
        },
        {
          incluir: true,
          propietario: "Carlos Hernández",
          contador: "María Rivas",
          registroContador: "CVPCPA-1234",
        },
      ),
    );
    expect(descargarExcel).toHaveBeenCalledWith(expect.any(Blob), documento);
  });

  it("omite el logotipo y las firmas cuando se desmarcan las casillas", async () => {
    const usuario = userEvent.setup();
    render(<ExportarEstado documento={documento} empresa={empresa} alcance="Consolidado" />);
    await usuario.click(screen.getByRole("button", { name: "Exportar con firmas" }));
    await usuario.click(screen.getByLabelText("Incluir espacios de firma"));
    await usuario.click(screen.getByLabelText("Incluir el logotipo de la empresa"));

    expect(
      screen.queryByRole("textbox", { name: "Propietario o representante legal" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Representante legal")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Exportar en Excel" }));
    await waitFor(() =>
      expect(crearExcel).toHaveBeenCalledWith(
        documento,
        expect.objectContaining({ logoUrl: null }),
        expect.objectContaining({ incluir: false }),
      ),
    );
  });

  it("el PDF lleva el encabezado, las firmas y el número de inscripción del contador", () => {
    const html = crearDocumentoPdf(
      documento,
      { ...encabezado, logoUrl: "https://ejemplo.test/logo.png" },
      { incluir: true, propietario: "Carlos Hernández", contador: "María Rivas", registroContador: "1234" },
    );

    expect(html).toContain("<p>CheroPhonex</p>");
    expect(html).toContain("<h1>Estado de resultados</h1>");
    expect(html).toContain("Del 01/11/2026 al 30/11/2026 · Consolidado");
    expect(html).toContain("Expresado en dólares de EE. UU.");
    expect(html).toContain('<img class="logo" src="https://ejemplo.test/logo.png"');
    expect(html).toContain("<span>Carlos Hernández</span><small>Representante legal</small>");
    expect(html).toContain("<span>María Rivas</span><small>Contador</small>");
    expect(html).toContain("Inscripción N.º 1234");
  });

  it("el PDF sin firmas ni logotipo no deja espacios de firma y usa las iniciales", () => {
    const html = crearDocumentoPdf(documento, encabezado, { ...firmas, incluir: false });
    expect(html).not.toContain('class="firmas"');
    expect(html).not.toContain("<img");
    expect(html).toContain('<span class="marca">C</span>');
  });

  it("escapa los datos de empresa y los nombres en el documento imprimible", () => {
    const html = crearDocumentoPdf(
      documento,
      { ...encabezado, empresa: "Chero <Phonex>" },
      { ...firmas, propietario: "Ana & Luis" },
    );
    expect(html).toContain("Chero &lt;Phonex&gt;");
    expect(html).toContain("Ana &amp; Luis");
    expect(html).not.toContain("Chero <Phonex>");
  });

  it("formatea los montos del PDF con separador de miles y pérdidas entre paréntesis", () => {
    const html = crearDocumentoPdf(documento, encabezado, firmas);
    expect(html).toContain(">46,051.20</td>");
    expect(html).toContain(">(7,594.99)</td>");
    expect(html).not.toContain("46051.20");
    expect(html).not.toContain("-7594.99");
  });
});
