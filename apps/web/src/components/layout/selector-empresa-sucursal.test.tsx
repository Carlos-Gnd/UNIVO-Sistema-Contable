import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SucursalDetalle } from "@contable/shared";
import { LayoutPrincipal } from "./layout-principal";
import { useSucursalActiva } from "./contexto-sucursal";
import { renderizar } from "@/test/render";
import { simularApi } from "@/test/api-simulada";

const CLAVE_ULTIMA_SELECCION = "contable:ultima-seleccion";

const EMPRESAS = "GET /empresas/disponibles";
const sucursal = (id: string, empresaId: string, nombre: string, esMatriz = false): SucursalDetalle => ({
  id,
  empresaId,
  nombre,
  codigoEstablecimiento: esMatriz ? "M001" : "S001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz,
  activa: true,
  creadoEn: "2026-11-13T00:00:00.000Z",
  actualizadoEn: "2026-11-13T00:00:00.000Z",
});

function SucursalEnContexto() {
  const activa = useSucursalActiva();
  return (
    <output role="status" aria-label="Sucursal activa">
      {activa?.sucursalId ?? "sin sucursal"}
    </output>
  );
}

function abrir(ruta: string) {
  return renderizar(
    <LayoutPrincipal ruta={ruta} empresaId="e1">
      <SucursalEnContexto />
    </LayoutPrincipal>,
  );
}

afterEach(() => localStorage.removeItem(CLAVE_ULTIMA_SELECCION));

describe("selector de empresa y sucursal (S1-T51)", () => {
  it("marca la empresa de demostración en el selector", async () => {
    simularApi({
      [EMPRESAS]: {
        cuerpo: [
          { id: "e1", nombre: "CHERO PHONEX", esDemostracion: true },
          { id: "e2", nombre: "Empresa dos", esDemostracion: false },
        ],
      },
      "GET /empresas/e1/sucursales": { cuerpo: [sucursal("s1", "e1", "Matriz", true)] },
    });
    abrir("/empresas/e1");
    const selector = await screen.findByRole("combobox", { name: "Empresa" });
    await waitFor(() =>
      expect(selector.querySelector('option[value="e1"]')?.textContent).toBe("CHERO PHONEX (demostración)"),
    );
    expect(selector.querySelector('option[value="e2"]')?.textContent).toBe("Empresa dos");
  });

  it("cambiar de empresa conserva la subruta", async () => {
    simularApi({
      [EMPRESAS]: {
        cuerpo: [
          { id: "e1", nombre: "Empresa uno" },
          { id: "e2", nombre: "Empresa dos" },
        ],
      },
      "GET /empresas/e1/sucursales": { cuerpo: [sucursal("s1", "e1", "Matriz", true)] },
    });
    const { usuario } = abrir("/empresas/e1/partidas/nueva");
    const selector = await screen.findByRole("combobox", { name: "Empresa" });
    await waitFor(() => expect(selector.querySelector('option[value="e2"]')).not.toBeNull());
    await usuario.selectOptions(selector, "e2");
    expect(window.location.pathname).toBe("/empresas/e2/partidas/nueva");
  });

  it("deshabilita el selector cuando no hay sucursales activas", async () => {
    simularApi({
      [EMPRESAS]: { cuerpo: [{ id: "e1", nombre: "Empresa uno" }] },
      "GET /empresas/e1/sucursales": { cuerpo: [{ ...sucursal("s0", "e1", "Inactiva"), activa: false }] },
    });
    abrir("/empresas/e1");
    expect(await screen.findByRole("combobox", { name: "Sucursal" })).toBeDisabled();
  });

  it("publica en el contexto la sucursal matriz por defecto", async () => {
    simularApi({
      [EMPRESAS]: { cuerpo: [{ id: "e1", nombre: "Empresa uno" }] },
      "GET /empresas/e1/sucursales": {
        cuerpo: [sucursal("s2", "e1", "Sucursal secundaria"), sucursal("s1", "e1", "Casa matriz", true)],
      },
    });
    abrir("/empresas/e1");
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Sucursal activa" })).toHaveTextContent("s1"),
    );
    expect(screen.getByRole("combobox", { name: "Sucursal" })).toHaveValue("s1");
  });

  it("restaura la sucursal guardada si sigue activa", async () => {
    localStorage.setItem(CLAVE_ULTIMA_SELECCION, JSON.stringify({ empresaId: "e1", sucursalId: "s2" }));
    simularApi({
      [EMPRESAS]: { cuerpo: [{ id: "e1", nombre: "Empresa uno" }] },
      "GET /empresas/e1/sucursales": {
        cuerpo: [sucursal("s1", "e1", "Casa matriz", true), sucursal("s2", "e1", "Sucursal dos")],
      },
    });
    abrir("/empresas/e1");
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Sucursal activa" })).toHaveTextContent("s2"),
    );
    expect(screen.getByRole("combobox", { name: "Sucursal" })).toHaveValue("s2");
  });

  it("usa la matriz y publica esa selección si la sucursal guardada ya está inactiva", async () => {
    localStorage.setItem(CLAVE_ULTIMA_SELECCION, JSON.stringify({ empresaId: "e1", sucursalId: "s2" }));
    simularApi({
      [EMPRESAS]: { cuerpo: [{ id: "e1", nombre: "Empresa uno" }] },
      "GET /empresas/e1/sucursales": {
        cuerpo: [
          sucursal("s1", "e1", "Casa matriz", true),
          { ...sucursal("s2", "e1", "Sucursal inactiva"), activa: false },
        ],
      },
    });
    abrir("/empresas/e1");
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Sucursal activa" })).toHaveTextContent("s1"),
    );
    expect(screen.getByRole("combobox", { name: "Sucursal" })).toHaveValue("s1");
    expect(JSON.parse(localStorage.getItem(CLAVE_ULTIMA_SELECCION) ?? "null")).toEqual({
      empresaId: "e1",
      sucursalId: "s1",
    });
  });
});
