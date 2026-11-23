import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HojaTrabajo } from "@contable/shared";

const { crearHojaTrabajoExcel, descargarHojaTrabajoExcel } = vi.hoisted(() => ({
  crearHojaTrabajoExcel: vi.fn(),
  descargarHojaTrabajoExcel: vi.fn(),
}));

vi.mock("./hoja-trabajo-excel", () => ({
  crearHojaTrabajoExcel,
  descargarHojaTrabajoExcel,
}));

import { ExportarExcelHojaTrabajo } from "./exportar-excel";

describe("ExportarExcelHojaTrabajo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crearHojaTrabajoExcel.mockResolvedValue(new Blob(["xlsx"]));
  });

  it("muestra la opción Excel y descarga el archivo del reporte", async () => {
    const usuario = userEvent.setup();
    const reporte = { desde: "2026-11-01", hasta: "2026-11-30" } as HojaTrabajo;
    const datos = { empresa: "CheroPhonex, S.A. de C.V.", alcance: "Consolidado" };
    render(<ExportarExcelHojaTrabajo reporte={reporte} datos={datos} />);

    await usuario.click(screen.getByRole("button", { name: "Exportar" }));
    await usuario.click(screen.getByRole("menuitem", { name: "Excel" }));

    await waitFor(() => expect(crearHojaTrabajoExcel).toHaveBeenCalledWith(reporte, datos));
    expect(descargarHojaTrabajoExcel).toHaveBeenCalledWith(expect.any(Blob), reporte);
  });

  it("deshabilita la exportación cuando el reporte está indisponible", () => {
    render(
      <ExportarExcelHojaTrabajo
        reporte={{} as HojaTrabajo}
        datos={{ empresa: "CheroPhonex", alcance: "Consolidado" }}
        deshabilitado
      />,
    );

    expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
  });
});
