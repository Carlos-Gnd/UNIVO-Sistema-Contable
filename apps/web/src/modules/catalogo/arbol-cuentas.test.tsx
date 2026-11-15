import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderizar } from "@/test/render";
import { ArbolCuentas, type CuentaCatalogoArbol } from "./arbol-cuentas";
import { ETIQUETAS_ARBOL_CUENTAS } from "./textos";

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

const abrir = () => renderizar(<ArbolCuentas cuentas={cuentas} etiquetas={ETIQUETAS_ARBOL_CUENTAS} />);

describe("árbol de cuentas (S1-T72 y S1-T73)", () => {
  it("organiza las cuentas por padre y deja abiertos los grupos de primer nivel", () => {
    abrir();

    const filas = within(screen.getByRole("treegrid", { name: "Cuentas" }));
    expect(filas.getByRole("row", { name: /^1 Activo\b/ })).toBeInTheDocument();
    expect(filas.getByRole("row", { name: /^11 Activo corriente\b/ })).toBeInTheDocument();
    expect(filas.queryByRole("row", { name: /1101 Efectivo y equivalentes/ })).not.toBeInTheDocument();
  });

  it("expande y contrae una cuenta desde su botón accesible", async () => {
    const { usuario } = abrir();

    await usuario.click(screen.getByRole("button", { name: "Expandir Activo corriente" }));
    expect(screen.getByRole("row", { name: /1101 Efectivo y equivalentes/ })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Contraer Activo corriente" }));
    expect(screen.queryByRole("row", { name: /1101 Efectivo y equivalentes/ })).not.toBeInTheDocument();
  });

  it("expande y contrae el árbol completo", async () => {
    const { usuario } = abrir();

    await usuario.click(screen.getByRole("button", { name: "Expandir todo" }));
    expect(screen.getByRole("row", { name: /110101 Caja general/ })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Contraer todo" }));
    expect(screen.queryByRole("row", { name: /11 Activo corriente/ })).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /2 Pasivo/ })).toBeInTheDocument();
  });

  it("marca como imputable una cuenta cuando el dato ya fue deducido", () => {
    abrir();

    expect(screen.getAllByText("Imputable").length).toBeGreaterThan(0);
  });

  it("busca por código y conserva las cuentas antecesoras", async () => {
    const { usuario } = abrir();

    await usuario.type(screen.getByRole("searchbox", { name: "Buscar cuentas" }), "110101");

    expect(screen.getByText("1101")).toBeInTheDocument();
    expect(screen.getByText("110101")).toBeInTheDocument();
    expect(screen.queryByText("Pasivo")).not.toBeInTheDocument();
  });

  it("al buscar por una cuenta padre incluye también sus descendientes", async () => {
    const { usuario } = abrir();

    await usuario.type(screen.getByRole("searchbox", { name: "Buscar cuentas" }), "Efectivo");

    expect(screen.getByText("Efectivo y equivalentes")).toBeInTheDocument();
    expect(screen.getByText("Caja general")).toBeInTheDocument();
  });
});
