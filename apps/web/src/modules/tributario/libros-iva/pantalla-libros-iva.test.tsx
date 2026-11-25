import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { LibroCompras } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaLibrosIva } from "./pantalla-libros-iva";

vi.mock("./libro-pdf", () => ({ imprimirLibroIva: vi.fn(() => true) }));
vi.mock("./libro-excel", () => ({
  crearLibroIvaExcel: vi.fn(async () => new Blob(["xlsx"])),
  descargarLibroIvaExcel: vi.fn(),
}));
import { imprimirLibroIva } from "./libro-pdf";
import { crearLibroIvaExcel, descargarLibroIvaExcel } from "./libro-excel";

const E = "e1";
const COMPRAS = `GET /empresas/${E}/libros-iva/compras`;
const BASE = {
  [`GET /empresas/${E}/sucursales`]: { cuerpo: [] },
  [`GET /empresas/${E}`]: {
    cuerpo: { id: E, nombre: "CheroPhonex S.A. de C.V.", nombreComercial: "CheroPhonex", nrc: "312456-7" },
  },
};

const libro = (extra: Partial<LibroCompras> = {}): LibroCompras => ({
  desde: "2026-11-01",
  hasta: "2026-11-30",
  filas: [
    {
      numero: 1,
      documentoId: "d1",
      fecha: "2026-11-02",
      tipoDocumento: "ccf",
      numeroDocumento: "CCF-P001",
      nrcProveedor: "301245-7",
      proveedor: "Totalynk El Salvador",
      concepto: "Mercadería para la venta",
      sucursal: "Casa matriz",
      anulado: false,
      comprasExentas: "0.00",
      comprasNoSujetas: "0.00",
      comprasGravadas: "11670.00",
      creditoFiscal: "1517.10",
      ivaPercibido: "0.00",
      ivaRetenido: "0.00",
      totalCompras: "13187.10",
    },
  ],
  totales: {
    comprasExentas: "0.00",
    comprasNoSujetas: "0.00",
    comprasGravadas: "11670.00",
    creditoFiscal: "1517.10",
    ivaPercibido: "0.00",
    ivaRetenido: "0.00",
    totalCompras: "13187.10",
  },
  ...extra,
});

const abrir = (permisos: string[] = ["iva.ver"]) =>
  renderizar(<PantallaLibrosIva parametros={{ empresaId: E }} />, { permisos: permisos as never });

describe("libros de IVA (HU-45)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("pide el libro de compras del mes en curso y muestra renglones y totales", async () => {
    const peticiones = simularApi({ ...BASE, [COMPRAS]: { cuerpo: libro() } });
    abrir();

    expect(await screen.findByText("Totalynk El Salvador")).toBeInTheDocument();
    const consulta = peticiones.find((p) => p.ruta.endsWith("/libros-iva/compras"));
    expect(consulta?.consulta.get("desde")).toBe("2026-11-01");
    expect(consulta?.consulta.get("hasta")).toBe("2026-11-30");
    expect(consulta?.consulta.has("sucursalId")).toBe(false);

    const totales = screen.getByRole("row", { name: /TOTALES/ });
    expect(within(totales).getByText("13,187.10")).toBeInTheDocument();
    expect(within(totales).getByText("1,517.10")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Compras" })).toHaveAttribute("aria-selected", "true");
  });

  it("muestra el estado vacío cuando no hay documentos", async () => {
    simularApi({
      ...BASE,
      [COMPRAS]: {
        cuerpo: libro({
          filas: [],
          totales: {
            ...libro().totales,
            totalCompras: "0.00",
            creditoFiscal: "0.00",
            comprasGravadas: "0.00",
          },
        }),
      },
    });
    abrir();
    expect(await screen.findByText("Sin documentos en este período.")).toBeInTheDocument();
  });

  it("no consulta ni exporta sin el permiso iva.ver", () => {
    const peticiones = simularApi({ ...BASE, [COMPRAS]: { cuerpo: libro() } });
    abrir(["reportes.ver"]);
    expect(screen.getByText("Tu rol no permite consultar este reporte.")).toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta.includes("libros-iva"))).toBe(false);
  });

  it("muestra el error de la API y permite reintentar", async () => {
    simularApi({ ...BASE, [COMPRAS]: { estado: 500, cuerpo: { message: "Falla" } } });
    abrir();
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("exporta a PDF y a Excel el libro que se ve", async () => {
    simularApi({ ...BASE, [COMPRAS]: { cuerpo: libro() } });
    const { usuario } = abrir();
    await screen.findByText("Totalynk El Salvador");
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar" })).toBeEnabled());

    await usuario.click(screen.getByRole("button", { name: "Exportar" }));
    await usuario.click(await screen.findByRole("button", { name: "PDF" }));
    expect(imprimirLibroIva).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: "Libro de compras" }),
      expect.objectContaining({ empresa: "CheroPhonex", nrc: "312456-7" }),
    );

    await usuario.click(screen.getByRole("button", { name: "Exportar" }));
    await usuario.click(await screen.findByRole("button", { name: "Excel" }));
    await waitFor(() => expect(descargarLibroIvaExcel).toHaveBeenCalled());
    expect(crearLibroIvaExcel).toHaveBeenCalled();
  });
});
