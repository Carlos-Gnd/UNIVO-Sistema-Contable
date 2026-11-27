import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { EstadoFirmadoVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaEstadosFirmados } from "./pantalla-estados-firmados";

const E = "11111111-1111-4111-8111-111111111111";
const RUTA = `/empresas/${E}/estados-firmados`;
const ID = "33333333-3333-4333-8333-333333333333";
const firma: EstadoFirmadoVista = {
  id: ID,
  codigoVerificacion: "ABCD-EFGH-JKLM",
  titulo: "Balance general",
  periodo: "Al 30/11/2026",
  firmante: "María Rivas",
  cargo: "Contador",
  firmadoEn: "2026-11-27T18:30:00.000Z",
  huellaDocumento: "b".repeat(64),
  urlVerificacion: "http://localhost:5173/verificar/ABCD-EFGH-JKLM",
};

const abrir = (permisos: Parameters<typeof renderizar>[1] = { permisos: ["estados.ver"] }) =>
  renderizar(<PantallaEstadosFirmados parametros={{ empresaId: E }} />, permisos);

afterEach(() => vi.unstubAllGlobals());

describe("lista de estados firmados (HU-87, S4-T32)", () => {
  it("sin permiso no consulta la API", () => {
    const peticiones = simularApi({});
    abrir({ permisos: [] });
    expect(screen.getByText("No tienes permiso para ver los estados firmados.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("muestra la carga y luego los estados con su código", async () => {
    simularApi({ ["GET " + RUTA]: { cuerpo: [firma] } });
    abrir();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando estados firmados…");
    expect(await screen.findByText("ABCD-EFGH-JKLM")).toBeInTheDocument();
    expect(screen.getByText("Balance general")).toBeInTheDocument();
    expect(screen.getByText("María Rivas")).toBeInTheDocument();
  });

  it("explica que no hay estados firmados", async () => {
    simularApi({ ["GET " + RUTA]: { cuerpo: [] } });
    abrir();
    expect(await screen.findByText("Todavía no hay estados firmados.")).toBeInTheDocument();
  });

  it("muestra el error de la API y permite reintentar", async () => {
    simularApi({ ["GET " + RUTA]: { estado: 500, cuerpo: { message: "Falla" } } });
    abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los estados firmados.");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("descarga el PDF firmado y abre el detalle con la huella", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: vi.fn(() => "blob:pdf"), revokeObjectURL: vi.fn() }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const peticiones = simularApi({
      ["GET " + RUTA]: { cuerpo: [firma] },
      [`GET ${RUTA}/${ID}/pdf`]: { archivo: new Blob(["%PDF"]) },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Descargar PDF firmado ABCD-EFGH-JKLM" }));
    await waitFor(() => expect(peticiones.some((p) => p.ruta === `${RUTA}/${ID}/pdf`)).toBe(true));

    await usuario.click(screen.getByRole("button", { name: "Ver detalle de ABCD-EFGH-JKLM" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Código de verificación");
    expect(screen.getByTitle("b".repeat(64))).toBeInTheDocument();
  });
});
