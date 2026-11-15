import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderizar } from "@/test/render";
import { LayoutPrincipal } from "./layout-principal";

// jsdom no aplica CSS: estas pruebas verifican las clases de Tailwind que adaptan el layout (S1-T27)

async function abrirMenu() {
  const resultado = renderizar(
    <LayoutPrincipal ruta="/empresas/e1/sucursales" empresaId="e1">
      <p>Contenido</p>
    </LayoutPrincipal>,
    { permisos: ["empresa.ver", "sucursales.ver"] },
  );
  await resultado.usuario.click(screen.getByRole("button", { name: "Abrir menú" }));
  return screen.getByRole("dialog", { name: "Menú principal" });
}

describe("LayoutPrincipal adaptable", () => {
  it("el encabezado es más bajo en celular", () => {
    renderizar(
      <LayoutPrincipal ruta="/empresas/e1/sucursales" empresaId="e1">
        <p>Contenido</p>
      </LayoutPrincipal>,
      { permisos: ["sucursales.ver"] },
    );
    expect(screen.getByRole("banner")).toHaveClass("h-[60px]", "px-3", "sm:h-16", "sm:px-5");
  });

  it("en celular la ubicación solo muestra la pantalla actual", () => {
    renderizar(
      <LayoutPrincipal ruta="/empresas/e1/sucursales" empresaId="e1">
        <p>Contenido</p>
      </LayoutPrincipal>,
      { permisos: ["sucursales.ver"] },
    );
    const ubicacion = screen.getByRole("navigation", { name: "Ubicación" });
    expect(within(ubicacion).getByText("Administración")).toHaveClass("hidden", "sm:flex");
    expect(within(ubicacion).getByText("Sucursales")).not.toHaveClass("hidden");
  });

  it("el menú ocupa todo el ancho en celular y se limita a 1040 px en pantallas grandes", async () => {
    const menu = await abrirMenu();
    expect(menu).toHaveClass(
      "left-2",
      "w-[calc(100vw-16px)]",
      "sm:left-4",
      "sm:w-[min(1040px,calc(100vw-32px))]",
    );
  });

  it("los grupos van en una columna en celular, dos en tableta y tres en computadora", async () => {
    const menu = await abrirMenu();
    expect(within(menu).getByRole("listbox")).toHaveClass("columns-1", "sm:columns-2", "lg:columns-3");
  });

  it("en celular las opciones son más altas para tocarlas y se oculta la ayuda de teclado", async () => {
    const menu = await abrirMenu();
    expect(within(menu).getByRole("option", { name: "Sucursales" })).toHaveClass("h-11", "sm:h-10");
    // La fila de ayuda (↑ ↓ moverse, ↵ abrir…) y el aviso de Esc no sirven en pantallas táctiles
    expect(within(menu).getByText("moverse").parentElement).toHaveClass("hidden", "sm:flex");
    expect(within(menu).getByText("cerrar")).toHaveClass("hidden", "sm:flex");
  });
});
