import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import type { CuentaCatalogo } from "./tipos";
import { PantallaCuentas } from "./pantalla-cuentas";

const EMPRESA = "e1";
const RUTA = `GET /empresas/${EMPRESA}/cuentas`;
const PERMISOS: CodigoPermiso[] = ["catalogo.ver", "catalogo.editar", "catalogo.inactivar"];

const cuentas: CuentaCatalogo[] = Array.from({ length: 12 }, (_, indice) => {
  const posicion = indice + 1;
  const codigo = posicion === 12 ? "6101" : String(posicion);
  return {
    id: `cuenta-${posicion}`,
    codigo,
    nombre: posicion === 12 ? "Depreciación" : `Cuenta ${posicion}`,
    nivel: codigo.length === 1 ? 1 : 3,
    naturaleza: "deudora",
    tipo: "activo",
    cuentaPadreId: null,
    activa: posicion !== 12,
  };
});

const abrir = (permisos: CodigoPermiso[] = PERMISOS) =>
  renderizar(<PantallaCuentas parametros={{ empresaId: EMPRESA }} />, { permisos });

describe("listado de cuentas (S1-T64)", () => {
  it("busca por código o nombre sin distinguir mayúsculas ni acentos", async () => {
    simularApi({ [RUTA]: { cuerpo: cuentas } });
    const { usuario } = abrir();

    await usuario.type(
      await screen.findByRole("searchbox", { name: "Buscar por código o nombre" }),
      "depreciacion",
    );

    expect(screen.getByRole("row", { name: /6101 Depreciación/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Cuenta 1/ })).not.toBeInTheDocument();
  });

  it("filtra por estado y nivel", async () => {
    simularApi({ [RUTA]: { cuerpo: cuentas } });
    const { usuario } = abrir();

    await screen.findByText("Página 1 de 2 · 12 cuentas");
    await usuario.selectOptions(screen.getByLabelText("Estado"), "inactivas");
    await usuario.selectOptions(screen.getByLabelText("Nivel"), "2");

    expect(screen.getByRole("row", { name: /6101 Depreciación/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Cuenta 1/ })).not.toBeInTheDocument();
  });

  it("pagina los resultados y evita navegar fuera de los límites", async () => {
    simularApi({ [RUTA]: { cuerpo: cuentas } });
    const { usuario } = abrir();

    expect(await screen.findByText("Página 1 de 2 · 12 cuentas")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /^1 Cuenta 1\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /6101 Depreciación/ })).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /Siguiente/ }));

    expect(screen.getByText("Página 2 de 2 · 12 cuentas")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /6101 Depreciación/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Siguiente/ })).toBeDisabled();
  });

  it("oculta las acciones de mantenimiento a quien solo tiene permiso de consulta", async () => {
    simularApi({ [RUTA]: { cuerpo: cuentas } });
    abrir(["catalogo.ver"]);

    await screen.findByText("Página 1 de 2 · 12 cuentas");

    expect(screen.queryByRole("button", { name: "Nueva cuenta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar|Inactivar|Activar/ })).not.toBeInTheDocument();
  });
});
