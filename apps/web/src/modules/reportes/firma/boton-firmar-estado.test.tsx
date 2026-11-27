import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { EstadoFirmadoVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { DocumentoEstado } from "../exportacion/documento-estado";
import { BotonFirmarEstado } from "./boton-firmar-estado";

const E = "11111111-1111-4111-8111-111111111111";
const RUTA = `/empresas/${E}/estados-firmados`;
const FIRMA_ID = "33333333-3333-4333-8333-333333333333";

const documento: DocumentoEstado = {
  titulo: "Estado de resultados",
  periodo: "Del 01/11/2026 al 30/11/2026",
  columnas: [{ titulo: "US$", tipo: "dinero" }],
  filas: [{ id: "n", texto: "Utilidad neta", valores: ["100.00"], tipo: "resultado" }],
  nombreHoja: "Estado",
  nombreArchivo: "estado",
};

const firma: EstadoFirmadoVista = {
  id: FIRMA_ID,
  codigoVerificacion: "ABCD-EFGH-JKLM",
  titulo: "Estado de resultados",
  periodo: documento.periodo,
  firmante: "María Rivas",
  cargo: "Contador",
  firmadoEn: "2026-11-27T18:30:00.000Z",
  huellaDocumento: "a".repeat(64),
  urlVerificacion: "http://localhost:5173/verificar/ABCD-EFGH-JKLM",
};

const abrir = (permisos: Parameters<typeof renderizar>[1] = { permisos: ["estados.firmar"] }) =>
  renderizar(<BotonFirmarEstado empresaId={E} documento={documento} alcance="Consolidado" />, permisos);

afterEach(() => vi.unstubAllGlobals());

describe("botón para firmar un estado (HU-87, S4-T32)", () => {
  it("sin el permiso estados.firmar no muestra el botón", () => {
    abrir({ permisos: ["estados.ver"] });
    expect(screen.queryByRole("button", { name: "Firmar digitalmente" })).not.toBeInTheDocument();
  });

  it("firma el estado exportado, muestra el código de verificación y descarga el PDF firmado", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: vi.fn(() => "blob:pdf"), revokeObjectURL: vi.fn() }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const peticiones = simularApi({
      ["POST " + RUTA]: { estado: 201, cuerpo: firma },
      [`GET ${RUTA}/${FIRMA_ID}/pdf`]: {
        archivo: new Blob(["%PDF"]),
        cabeceras: { "Content-Disposition": 'attachment; filename="estado-ABCD.pdf"' },
      },
    });
    const { usuario } = abrir();

    await usuario.click(screen.getByRole("button", { name: "Firmar digitalmente" }));
    await usuario.type(screen.getByLabelText(/Calidad en que firmas/), "Contador general");
    await usuario.click(screen.getByRole("button", { name: "Firmar estado" }));

    expect(await screen.findByText("ABCD-EFGH-JKLM")).toBeInTheDocument();
    const envio = peticiones.find((p) => p.metodo === "POST");
    expect(envio?.cuerpo).toEqual({
      titulo: "Estado de resultados",
      periodo: "Del 01/11/2026 al 30/11/2026",
      alcance: "Consolidado",
      cargo: "Contador general",
      columnas: [{ titulo: "US$", tipo: "dinero" }],
      filas: [{ texto: "Utilidad neta", tipo: "resultado", valores: ["100.00"] }],
    });

    await usuario.click(screen.getByRole("button", { name: "Descargar PDF firmado" }));
    await waitFor(() => expect(peticiones.some((p) => p.ruta.endsWith("/pdf"))).toBe(true));
  });

  it("si la API rechaza la firma, muestra el error y deja reintentar", async () => {
    simularApi({ ["POST " + RUTA]: { estado: 503, cuerpo: { message: "La firma no está disponible." } } });
    const { usuario } = abrir();

    await usuario.click(screen.getByRole("button", { name: "Firmar digitalmente" }));
    await usuario.click(screen.getByRole("button", { name: "Firmar estado" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo firmar el estado.");
    expect(screen.getByRole("button", { name: "Firmar estado" })).toBeEnabled();
  });
});
