import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { LibroCompras, LibroConsumidor, LibroContribuyentes } from "@contable/shared";
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
const CONTRIBUYENTES = `GET /empresas/${E}/libros-iva/contribuyentes`;
const CONSUMIDOR = `GET /empresas/${E}/libros-iva/consumidor-final`;
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

  it("cambia al libro de ventas a contribuyentes con la pestaña y lo exporta", async () => {
    const contribuyentes: LibroContribuyentes = {
      desde: "2026-11-01",
      hasta: "2026-11-30",
      filas: [
        {
          numero: 1,
          documentoId: "v1",
          fecha: "2026-11-08",
          tipoDocumento: "ccf",
          numeroDocumento: "CCF-0001",
          nrcCliente: "245871-3",
          cliente: "Tecno Plaza San Miguel",
          sucursal: "Casa matriz",
          anulado: false,
          ventasExentas: "0.00",
          ventasNoSujetas: "0.00",
          ventasGravadas: "2740.50",
          debitoFiscal: "356.27",
          ivaPercibido: "0.00",
          ivaRetenido: "0.00",
          ventaTotal: "3096.77",
        },
      ],
      totales: {
        ventasExentas: "0.00",
        ventasNoSujetas: "0.00",
        ventasGravadas: "2740.50",
        debitoFiscal: "356.27",
        ivaPercibido: "0.00",
        ivaRetenido: "0.00",
        ventaTotal: "3096.77",
      },
    };
    const peticiones = simularApi({
      ...BASE,
      [COMPRAS]: { cuerpo: libro() },
      [CONTRIBUYENTES]: { cuerpo: contribuyentes },
    });
    const { usuario } = abrir();
    await screen.findByText("Totalynk El Salvador");

    await usuario.click(screen.getByRole("tab", { name: "Ventas a contribuyentes" }));
    expect(await screen.findByText("Tecno Plaza San Miguel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Libro de ventas a contribuyentes" })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /TOTALES/ })).getByText("356.27")).toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta.endsWith("/libros-iva/contribuyentes"))).toBe(true);

    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Exportar" }));
    await usuario.click(await screen.findByRole("button", { name: "PDF" }));
    expect(imprimirLibroIva).toHaveBeenLastCalledWith(
      expect.objectContaining({ titulo: "Libro de ventas a contribuyentes" }),
      expect.anything(),
    );
  });

  it("cambia al libro de ventas a consumidor final y muestra el resumen por rango", async () => {
    const consumidor: LibroConsumidor = {
      desde: "2026-11-01",
      hasta: "2026-11-30",
      filas: [
        {
          numero: 1,
          fecha: "2026-11-10",
          sucursal: "Casa matriz",
          del: "FCF-00001",
          al: "FCF-00015",
          documentos: 1,
          ventasExentas: "0.00",
          ventasNoSujetas: "0.00",
          ventasGravadas: "3966.30",
          ivaIncluido: "515.62",
          exportaciones: "0.00",
          totalVentas: "4481.92",
        },
      ],
      totales: {
        ventasExentas: "0.00",
        ventasNoSujetas: "0.00",
        ventasGravadas: "3966.30",
        ivaIncluido: "515.62",
        exportaciones: "0.00",
        totalVentas: "4481.92",
      },
    };
    const peticiones = simularApi({
      ...BASE,
      [COMPRAS]: { cuerpo: libro() },
      [CONSUMIDOR]: { cuerpo: consumidor },
    });
    const { usuario } = abrir();
    await screen.findByText("Totalynk El Salvador");

    await usuario.click(screen.getByRole("tab", { name: "Ventas a consumidor final" }));
    expect(await screen.findByText("FCF-00015")).toBeInTheDocument();
    expect(screen.getByText("FCF-00001")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /TOTALES/ })).getByText("515.62")).toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta.endsWith("/libros-iva/consumidor-final"))).toBe(true);
  });
});
