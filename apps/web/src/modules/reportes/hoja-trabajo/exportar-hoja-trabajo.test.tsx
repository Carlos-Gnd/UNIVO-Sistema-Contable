import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HojaTrabajo } from "@contable/shared";
import { ExportarHojaTrabajo } from "./exportar-hoja-trabajo";

vi.mock("./hoja-trabajo-pdf", () => ({ imprimirHojaTrabajo: vi.fn(() => true) }));
vi.mock("./hoja-trabajo-excel", () => ({
  crearHojaTrabajoExcel: vi.fn(async () => new Blob(["xlsx"])),
  descargarHojaTrabajoExcel: vi.fn(),
}));
import { imprimirHojaTrabajo } from "./hoja-trabajo-pdf";
import { crearHojaTrabajoExcel, descargarHojaTrabajoExcel } from "./hoja-trabajo-excel";

const hojaTrabajo: HojaTrabajo = {
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  lineas: [],
  totales: {
    balanzaDebe: "0.00",
    balanzaHaber: "0.00",
    ajustesDebe: "0.00",
    ajustesHaber: "0.00",
    balanzaAjustadaDebe: "0.00",
    balanzaAjustadaHaber: "0.00",
    estadoResultadosDebe: "0.00",
    estadoResultadosHaber: "0.00",
    balanceGeneralDebe: "0.00",
    balanceGeneralHaber: "0.00",
  },
  resultado: { tipo: null, monto: "0.00" },
  diferencias: {
    balanza: "0.00",
    ajustes: "0.00",
    balanzaAjustada: "0.00",
    estadoResultados: "0.00",
    balanceGeneral: "0.00",
  },
  cuadra: true,
};

const datos = { empresa: "CheroPhonex", alcance: "Consolidado" };

describe("ExportarHojaTrabajo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ofrece PDF y Excel y entrega la hoja actual al exportador PDF", async () => {
    const usuario = userEvent.setup();
    render(<ExportarHojaTrabajo hojaTrabajo={hojaTrabajo} datos={datos} />);

    await usuario.click(screen.getByRole("button", { name: "Exportar" }));
    await usuario.click(screen.getByRole("button", { name: "PDF" }));

    expect(imprimirHojaTrabajo).toHaveBeenCalledWith(hojaTrabajo, datos);
  });

  it("genera y descarga Excel con la hoja actual", async () => {
    const usuario = userEvent.setup();
    render(<ExportarHojaTrabajo hojaTrabajo={hojaTrabajo} datos={datos} />);

    await usuario.click(screen.getByRole("button", { name: "Exportar" }));
    await usuario.click(screen.getByRole("button", { name: "Excel" }));

    await waitFor(() => {
      expect(crearHojaTrabajoExcel).toHaveBeenCalledWith(hojaTrabajo, datos);
      expect(descargarHojaTrabajoExcel).toHaveBeenCalledWith(expect.any(Blob), hojaTrabajo);
    });
  });

  it("deshabilita la exportación cuando la consulta no está lista", () => {
    render(<ExportarHojaTrabajo datos={datos} />);

    expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
  });
});
