import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ParametrosEmpresa } from "@contable/shared";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaParametros } from "./pantalla-parametros";

const E = "e1";
const PERMISO: CodigoPermiso[] = ["empresa.configurar"];
const RUTA_PARAMETROS = `GET /empresas/${E}/parametros`;
const PARAMETROS: ParametrosEmpresa = {
  modoNumeracion: "anual",
  formatoEstados: "clase",
  metodoValuacion: "promedio_ponderado",
  sistemaInventario: "perpetuo",
  tieneMovimientos: false,
  bloqueados: [],
};

function abrir(datos: ParametrosEmpresa, permisos: CodigoPermiso[] = PERMISO) {
  simularApi({
    [RUTA_PARAMETROS]: { cuerpo: datos },
    [`GET /empresas/${E}`]: { cuerpo: { nombre: "Empresa de prueba", nombreComercial: "Empresa de prueba" } },
  });
  return renderizar(<PantallaParametros parametros={{ empresaId: E }} />, { permisos });
}

describe("pantalla de parámetros (S2-T03)", () => {
  it("muestra los modos de numeración en el orden del prototipo", async () => {
    abrir(PARAMETROS);
    const opciones = await screen.findAllByRole("radio");
    expect(opciones.slice(0, 3).map((opcion) => opcion.parentElement?.textContent)).toEqual([
      "Por mes",
      "Por ejercicio",
      "Por tipo",
    ]);
  });

  it("en modo de solo lectura deshabilita los controles de parámetros", async () => {
    abrir(PARAMETROS, []);
    const opciones = await screen.findAllByRole("radio");
    expect(opciones.length).toBeGreaterThan(0);
    for (const opcion of opciones) expect(opcion).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar parámetros" })).not.toBeInTheDocument();
  });

  it("bloquea numeración, valuación y sistema cuando hay movimientos", async () => {
    abrir({
      ...PARAMETROS,
      tieneMovimientos: true,
      bloqueados: ["modoNumeracion", "metodoValuacion", "sistemaInventario"],
    });

    expect(await screen.findByRole("radio", { name: "Por mes" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Costo promedio" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Perpetuo" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "De clase" })).toBeEnabled();
    expect(screen.getAllByText("Bloqueado: ya hay movimientos").length).toBeGreaterThan(0);
  });

  it("envía por PATCH únicamente el campo que cambió", async () => {
    let actualizado = PARAMETROS;
    const peticiones = simularApi({
      [RUTA_PARAMETROS]: () => ({ cuerpo: actualizado }),
      [`GET /empresas/${E}`]: {
        cuerpo: { nombre: "Empresa de prueba", nombreComercial: "Empresa de prueba" },
      },
      [`PATCH /empresas/${E}/parametros`]: ({ cuerpo }) => {
        actualizado = { ...actualizado, ...(cuerpo as Partial<ParametrosEmpresa>) };
        return { cuerpo: actualizado };
      },
    });
    const { usuario } = renderizar(<PantallaParametros parametros={{ empresaId: E }} />, {
      permisos: PERMISO,
    });

    await usuario.click(await screen.findByRole("radio", { name: "Por mes" }));
    await usuario.click(screen.getByRole("button", { name: "Guardar parámetros" }));

    await waitFor(() => expect(peticiones.some((peticion) => peticion.metodo === "PATCH")).toBe(true));
    expect(peticiones.find((peticion) => peticion.metodo === "PATCH")?.cuerpo).toEqual({
      modoNumeracion: "mensual",
    });
  });
});
