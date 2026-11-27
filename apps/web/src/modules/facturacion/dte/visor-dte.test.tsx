import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { simularApi, type RespuestaSimulada } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { E, RUTAS, vistaDte } from "./datos-prueba";
import { VisorDte } from "./visor-dte";

const ID = "dte-ccf";
const PDF = new Blob(["%PDF-1.7 representación gráfica"], { type: "application/pdf" });
const VER: CodigoPermiso[] = ["dte.ver"];
const INVALIDAR: CodigoPermiso[] = ["dte.ver", "dte.invalidar"];

const conPdf = (extra: Record<string, RespuestaSimulada> = {}) => ({
  [RUTAS.dte(ID)]: { cuerpo: vistaDte() },
  [RUTAS.pdf(ID)]: {
    archivo: PDF,
    cabeceras: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="DTE-03-M001P001-000000000000001.pdf"',
    },
  },
  ...extra,
});

const abrir = (permisos: CodigoPermiso[] = VER) =>
  renderizar(<VisorDte parametros={{ empresaId: E, dteId: ID }} />, { permisos });

let crearUrl: ReturnType<typeof vi.fn>;
let liberarUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom no implementa las URL de Blob
  crearUrl = vi.fn(() => "blob:http://localhost/pdf-dte");
  liberarUrl = vi.fn();
  Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: liberarUrl });
});
afterEach(() => vi.restoreAllMocks());

describe("visor de la representación gráfica del DTE (S4-T14)", () => {
  it("muestra el PDF de la representación gráfica dentro de la página", async () => {
    simularApi(conPdf());
    abrir();

    const marco = await screen.findByTitle("Representación gráfica de DTE-03-M001P001-000000000000001");
    expect(marco.tagName).toBe("IFRAME");
    expect(marco).toHaveAttribute("src", "blob:http://localhost/pdf-dte");
    const blob = crearUrl.mock.calls[0]![0] as Blob;
    expect(await blob.text()).toBe("%PDF-1.7 representación gráfica");
  });

  it("muestra la identificación, el sello y la firma verificada", async () => {
    simularApi(conPdf());
    abrir();

    expect(
      await screen.findByRole("heading", {
        name: "Comprobante de crédito fiscal DTE-03-M001P001-000000000000001",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("8E1F2D3C-4B5A-4C6D-8E7F-1A2B3C4D5E6F")).toBeInTheDocument();
    expect(screen.getByText("2026A1B2C3D4E5F60718293A4B5C6D7E8F9012AB")).toBeInTheDocument();
    expect(screen.getByText("27/11/2026 10:15:00")).toBeInTheDocument();
    expect(screen.getByText("US$ 565.00")).toBeInTheDocument();
    expect(screen.getByText("Procesado")).toBeInTheDocument();
    expect(screen.getByText("Firma verificada con el certificado de la empresa")).toBeInTheDocument();
  });

  it("el código QR lleva a la consulta pública de Hacienda con el código de generación y la fecha", async () => {
    simularApi(conPdf());
    abrir();

    const enlace = await screen.findByRole("link", { name: "Abrir la consulta pública" });
    const url = new URL(enlace.getAttribute("href")!);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ambiente: "00",
      codGen: "8E1F2D3C-4B5A-4C6D-8E7F-1A2B3C4D5E6F",
      fechaEmi: "2026-11-27",
    });
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("avisa si la firma no coincide con el documento", async () => {
    simularApi(conPdf({ [RUTAS.dte(ID)]: { cuerpo: vistaDte({ firmaValida: false }) } }));
    abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent("La firma no coincide con el documento");
  });

  it("descarga el PDF y el JSON firmado con su nombre", async () => {
    const peticiones = simularApi(
      conPdf({
        [RUTAS.json(ID)]: {
          archivo: new Blob(['{"firmaElectronica":"x"}'], { type: "application/json" }),
          cabeceras: { "Content-Disposition": 'attachment; filename="DTE-03-M001P001-000000000000001.json"' },
        },
      }),
    );
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { usuario } = abrir();

    await waitFor(() => expect(screen.getByRole("button", { name: "Descargar PDF" })).toBeEnabled());
    await usuario.click(screen.getByRole("button", { name: "Descargar PDF" }));
    await usuario.click(screen.getByRole("button", { name: "Descargar JSON" }));

    await waitFor(() => expect(clic).toHaveBeenCalledTimes(2));
    const nombres = clic.mock.contexts.map((a) => (a as HTMLAnchorElement).download);
    expect(nombres).toEqual(["DTE-03-M001P001-000000000000001.pdf", "DTE-03-M001P001-000000000000001.json"]);
    expect(peticiones.some((p) => p.ruta === `/empresas/${E}/dte/${ID}/json`)).toBe(true);
  });

  it("si no se genera la representación gráfica lo dice sin perder los datos del DTE", async () => {
    simularApi(conPdf({ [RUTAS.pdf(ID)]: { estado: 503, cuerpo: { message: "Falta FIRMA_SECRETO." } } }));
    abrir();
    expect(await screen.findByText(/No se pudo generar la representación gráfica/)).toBeInTheDocument();
    expect(screen.getByText("2026A1B2C3D4E5F60718293A4B5C6D7E8F9012AB")).toBeInTheDocument();
  });

  it("libera la URL del PDF al salir", async () => {
    simularApi(conPdf());
    const { unmount } = abrir();
    await screen.findByTitle(/Representación gráfica de/);
    unmount();
    expect(liberarUrl).toHaveBeenCalledWith("blob:http://localhost/pdf-dte");
  });

  it("solo con dte.invalidar se ofrece invalidar; al hacerlo envía el motivo", async () => {
    const peticiones = simularApi(
      conPdf({
        [RUTAS.invalidar(ID)]: {
          cuerpo: vistaDte({
            estado: "invalidado",
            invalidacion: {
              tipo: 2,
              motivo: "Emisión duplicada",
              invalidadoEn: "2026-11-27T16:30:00.000Z",
              selloRecepcion: "2026FFFF",
            },
          }),
        },
      }),
    );
    const { usuario } = abrir(INVALIDAR);
    await usuario.click(await screen.findByRole("button", { name: "Invalidar documento" }));
    const dialogo = screen.getByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Motivo de la invalidación"), "Emisión duplicada");
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar invalidación" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(peticiones.find((p) => p.metodo === "POST")!.cuerpo).toEqual({ motivo: "Emisión duplicada" });
  });

  it("un DTE invalidado muestra el evento y ya no ofrece invalidar", async () => {
    simularApi(
      conPdf({
        [RUTAS.dte(ID)]: {
          cuerpo: vistaDte({
            estado: "invalidado",
            invalidacion: {
              tipo: 2,
              motivo: "Emisión duplicada",
              invalidadoEn: "2026-11-27T16:30:00.000Z",
              selloRecepcion: "2026FFFF",
            },
          }),
        },
      }),
    );
    abrir(INVALIDAR);
    expect(await screen.findByText("Documento invalidado el 27/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Motivo: Emisión duplicada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invalidar documento" })).not.toBeInTheDocument();
  });

  it("si el DTE no existe lo dice", async () => {
    simularApi({ [RUTAS.dte(ID)]: { estado: 404, cuerpo: { message: "No se encontró el DTE." } } });
    abrir();
    expect(
      await screen.findByText(/No se pudo cargar el documento. No se encontró el DTE./),
    ).toBeInTheDocument();
  });
});
