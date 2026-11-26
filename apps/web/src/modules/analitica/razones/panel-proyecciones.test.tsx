import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PanelProyecciones } from "./panel-proyecciones";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const respuesta = {
  calculadaConDatosHasta: "2026-10-31",
  metodo: "promedio-movil",
  periodos: [
    {
      mes: "2026-11-01",
      ventas: { estimado: "46051.20", minimo: "42000.00", maximo: "50000.00" },
      gastos: { estimado: "34000.00", minimo: "31000.00", maximo: "37000.00" },
      utilidad: { estimado: "7594.99", minimo: "5000.00", maximo: "10000.00" },
      flujoEfectivo: { estimado: "12000.00", minimo: "9000.00", maximo: "15000.00" },
      iva: { estimado: "5986.66", minimo: "5000.00", maximo: "6500.00" },
    },
  ],
};

describe("PanelProyecciones", () => {
  it("envía los supuestos editables y presenta estimaciones y rangos de confianza", async () => {
    const usuario = userEvent.setup();
    const peticiones = simularApi({
      "POST /empresas/empresa-1/estados/proyecciones": ({ cuerpo }) => {
        expect(cuerpo).toEqual({
          meses: 3,
          crecimientoVentasMensual: 5,
          crecimientoGastosMensual: 2.5,
        });
        return { cuerpo: respuesta };
      },
    });
    renderizar(<PanelProyecciones empresaId="empresa-1" />);

    await usuario.clear(screen.getByRole("spinbutton", { name: "Meses a proyectar" }));
    await usuario.type(screen.getByRole("spinbutton", { name: "Meses a proyectar" }), "3");
    await usuario.clear(screen.getByRole("spinbutton", { name: "Cambio mensual de ventas (%)" }));
    await usuario.type(screen.getByRole("spinbutton", { name: "Cambio mensual de ventas (%)" }), "5");
    await usuario.clear(screen.getByRole("spinbutton", { name: "Cambio mensual de gastos (%)" }));
    await usuario.type(screen.getByRole("spinbutton", { name: "Cambio mensual de gastos (%)" }), "2.5");
    await usuario.click(screen.getByRole("button", { name: "Calcular proyección" }));

    expect(
      await screen.findByText("Método según el historial: Promedio móvil", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("US$ 46,051.20")).toBeInTheDocument();
    expect(screen.getByText("US$ 42,000.00 – US$ 50,000.00")).toBeInTheDocument();
    expect(screen.getByText(/no crea partidas ni modifica/i)).toBeInTheDocument();
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]?.metodo).toBe("POST");
  });

  it("rechaza supuestos fuera de rango sin llamar a la API", async () => {
    const usuario = userEvent.setup();
    const peticiones = simularApi({});
    renderizar(<PanelProyecciones empresaId="empresa-1" />);

    await usuario.clear(screen.getByRole("spinbutton", { name: "Meses a proyectar" }));
    await usuario.type(screen.getByRole("spinbutton", { name: "Meses a proyectar" }), "25");
    await usuario.click(screen.getByRole("button", { name: "Calcular proyección" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Usa de 1 a 24 meses");
    expect(peticiones).toHaveLength(0);
  });
});
