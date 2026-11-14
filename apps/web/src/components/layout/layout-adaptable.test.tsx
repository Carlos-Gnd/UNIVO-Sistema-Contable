import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import { renderizar } from "@/test/render";
import { LayoutPrincipal } from "./layout-principal";

/** matchMedia simulado: jsdom no lo implementa. Devuelve una función para cambiar si la consulta coincide. */
function simularMatchMedia() {
  const oyentes = new Set<(evento: MediaQueryListEvent) => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      addEventListener: (_: string, oyente: (evento: MediaQueryListEvent) => void) => oyentes.add(oyente),
      removeEventListener: (_: string, oyente: (evento: MediaQueryListEvent) => void) =>
        oyentes.delete(oyente),
    })),
  );
  return (matches: boolean) =>
    act(() => oyentes.forEach((oyente) => oyente({ matches } as MediaQueryListEvent)));
}

function renderizarLayout() {
  return renderizar(
    <LayoutPrincipal ruta="/empresas/e1" empresaId="e1">
      <p>Contenido</p>
    </LayoutPrincipal>,
    { permisos: ["empresa.ver", "sucursales.ver"] },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("LayoutPrincipal adaptable", () => {
  it("la barra lateral se oculta en celular y se compacta a íconos en tableta", () => {
    renderizarLayout();
    const barra = screen.getByRole("complementary");
    expect(barra).toHaveClass("hidden", "md:flex", "w-16", "lg:w-64");

    // En tableta solo queda el ícono: el nombre sigue disponible para lectores de pantalla y en el title
    const enlace = within(barra).getByRole("link", { name: "Sucursales" });
    expect(enlace).toHaveAttribute("title", "Sucursales");
    expect(within(enlace).getByText("Sucursales")).toHaveClass("md:max-lg:sr-only");
  });

  it("en celular el botón del encabezado abre el menú en un panel", async () => {
    const { usuario } = renderizarLayout();
    const boton = screen.getByRole("button", { name: "Abrir menú" });
    expect(boton).toHaveClass("md:hidden");

    await usuario.click(boton);
    const panel = screen.getByRole("dialog", { name: "Menú principal" });
    const enlace = within(panel).getByRole("link", { name: "Sucursales" });
    // En el panel siempre se ven los nombres completos
    expect(enlace).not.toHaveAttribute("title");
    expect(within(enlace).getByText("Sucursales")).not.toHaveClass("md:max-lg:sr-only");
  });

  it("elegir una opción navega y cierra el panel", async () => {
    const { usuario } = renderizarLayout();
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));

    await usuario.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Sucursales" }));

    expect(window.location.pathname).toBe("/empresas/e1/sucursales");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el panel se cierra con su botón o con Escape", async () => {
    const { usuario } = renderizarLayout();
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));
    await usuario.click(screen.getByRole("button", { name: "Cerrar menú" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el panel se cierra si la pantalla crece hasta mostrar la barra lateral", async () => {
    const cambiarAncho = simularMatchMedia();
    const { usuario } = renderizarLayout();
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    cambiarAncho(true);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 768px)");
  });
});
