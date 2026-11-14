// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ArbolCuentas, type EtiquetasArbolCuentas } from "./arbol-cuentas";
import type { CuentaCatalogoArbol } from "./arbol-cuentas";

const etiquetas: EtiquetasArbolCuentas = {
  titulo: "Catálogo de cuentas",
  expandirTodo: "Expandir todo",
  contraerTodo: "Contraer todo",
  buscar: "Buscar cuentas",
  marcadorBusqueda: "Buscar por código o nombre",
  codigo: "Código",
  cuenta: "Cuenta",
  estado: "Estado",
  imputable: "Imputable",
  vacio: "No hay cuentas",
  sinResultados: "No se encontraron cuentas",
  encabezado: "Cuenta de agrupación",
  detalle: "Nivel",
  activa: "Activa",
  inactiva: "Inactiva",
  expandirCuenta: (nombre) => `Expandir ${nombre}`,
  contraerCuenta: (nombre) => `Contraer ${nombre}`,
};

const cuentas: CuentaCatalogoArbol[] = [
  { id: "activo", codigo: "1", nombre: "Activo", nivel: 1, cuentaPadreId: null, activa: true },
  {
    id: "corriente",
    codigo: "11",
    nombre: "Activo corriente",
    nivel: 2,
    cuentaPadreId: "activo",
    activa: true,
  },
  {
    id: "efectivo",
    codigo: "1101",
    nombre: "Efectivo y equivalentes",
    nivel: 3,
    cuentaPadreId: "corriente",
    activa: true,
  },
  {
    id: "caja",
    codigo: "110101",
    nombre: "Caja general",
    nivel: 4,
    cuentaPadreId: "efectivo",
    activa: true,
    imputable: true,
  },
  { id: "pasivo", codigo: "2", nombre: "Pasivo", nivel: 1, cuentaPadreId: null, activa: true },
];

afterEach(cleanup);

describe("ArbolCuentas: búsqueda", () => {
  it("muestra la cuenta encontrada y sus antecesoras al buscar por código", async () => {
    const usuario = userEvent.setup();
    render(<ArbolCuentas cuentas={cuentas} etiquetas={etiquetas} />);

    await usuario.type(screen.getByRole("searchbox", { name: /Buscar cuentas/ }), "110101");

    expect(screen.getByText("1101")).toBeTruthy();
    expect(screen.getByText("110101")).toBeTruthy();
    expect(screen.queryByText("Pasivo")).toBeNull();
  });

  it("al coincidir un padre, muestra también sus cuentas hijas", async () => {
    const usuario = userEvent.setup();
    render(<ArbolCuentas cuentas={cuentas} etiquetas={etiquetas} />);

    await usuario.type(screen.getByRole("searchbox", { name: /Buscar cuentas/ }), "Efectivo");

    expect(screen.getByText("Efectivo y equivalentes")).toBeTruthy();
    expect(screen.getByText("Caja general")).toBeTruthy();
  });
});
