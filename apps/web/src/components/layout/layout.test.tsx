import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { toast } from "sonner";
import type { DefinicionRuta } from "@/app/rutas";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { renderizar } from "@/test/render";
import { gruposVisibles, opcionActiva } from "./opciones-menu";
import { LayoutPrincipal } from "./layout-principal";

vi.mock("sonner", async (original) => ({
  ...(await original<typeof import("sonner")>()),
  toast: vi.fn(),
}));

const Vacia = () => null;
const ruta = (patron: string): DefinicionRuta => ({ patron, componente: Vacia });

const RUTAS_PRUEBA = [
  ruta("/empresas/:empresaId"),
  ruta("/empresas/:empresaId/sucursales"),
  ruta("/empresas/:empresaId/partidas"),
  ruta("/empresas/:empresaId/partidas/:partidaId"),
];

const ids = (grupos: ReturnType<typeof gruposVisibles>) => grupos.flatMap((g) => g.opciones.map((o) => o.id));

describe("gruposVisibles", () => {
  it("solo se pueden abrir las opciones con pantalla registrada", () => {
    const opciones = gruposVisibles("e1", { rutas: RUTAS_PRUEBA }).flatMap((g) => g.opciones);
    const disponibles = opciones.filter((o) => o.href).map((o) => o.id);
    expect(disponibles).toEqual(["partidas", "empresa", "sucursales"]);
    expect(opciones.find((o) => o.id === "sucursales")?.href).toBe("/empresas/e1/sucursales");
    // Las de sprints futuros se muestran sin enlace, con su sprint
    expect(opciones.find((o) => o.id === "libroDiario")).toMatchObject({ href: null, sprint: 2 });
  });

  it("oculta las opciones sin permiso y los grupos que quedan vacíos", () => {
    const grupos = gruposVisibles("e1", {
      rutas: RUTAS_PRUEBA,
      permisos: new Set<CodigoPermiso>(["partidas.ver", "sucursales.ver"]),
    });
    expect(grupos.map((g) => g.id)).toEqual(["contabilidad", "administracion"]);
    expect(ids(grupos)).toEqual(["partidas", "sucursales"]);
  });

  it("busca por nombre sin importar mayúsculas ni tildes", () => {
    expect(ids(gruposVisibles("e1", { busqueda: "PERIODO" }))).toEqual(["periodos"]);
    expect(ids(gruposVisibles("e1", { busqueda: "bitacora" }))).toEqual(["bitacora"]);
    expect(gruposVisibles("e1", { busqueda: "zzz" })).toEqual([]);
  });

  it("codifica el identificador de la empresa en la ruta", () => {
    const opciones = gruposVisibles("a/b", { rutas: RUTAS_PRUEBA }).flatMap((g) => g.opciones);
    expect(opciones.find((o) => o.id === "empresa")?.href).toBe("/empresas/a%2Fb");
  });
});

describe("opcionActiva", () => {
  const grupos = gruposVisibles("e1", { rutas: RUTAS_PRUEBA });

  it("elige la opción de ruta más larga que contiene la ruta actual, con su grupo", () => {
    const activa = opcionActiva("/empresas/e1/partidas/abc", grupos);
    expect(activa?.opcion.id).toBe("partidas");
    expect(activa?.grupo.titulo).toBe("Contabilidad");
    expect(opcionActiva("/empresas/e1/sucursales/", grupos)?.opcion.id).toBe("sucursales");
  });

  it("la opción de empresa solo se activa en su ruta exacta", () => {
    expect(opcionActiva("/empresas/e1", grupos)?.opcion.id).toBe("empresa");
    expect(opcionActiva("/empresas/e1/otra", grupos)).toBeNull();
  });
});

const PERMISOS: CodigoPermiso[] = ["empresa.ver", "sucursales.ver", "reportes.ver"];

function renderizarLayout(rutaActual = "/empresas/e1/sucursales") {
  return renderizar(
    <LayoutPrincipal ruta={rutaActual} empresaId="e1">
      <p>Contenido de la pantalla</p>
    </LayoutPrincipal>,
    { permisos: PERMISOS },
  );
}

const menu = () => screen.getByRole("dialog", { name: "Menú principal" });
const opcion = (nombre: string | RegExp) => within(menu()).getByRole("option", { name: nombre });

afterEach(() => {
  vi.mocked(toast).mockClear();
  window.history.replaceState(null, "", "/");
});

describe("LayoutPrincipal", () => {
  it("muestra la ubicación, el contenido y la versión", () => {
    renderizarLayout();
    const ubicacion = screen.getByRole("navigation", { name: "Ubicación" });
    expect(ubicacion).toHaveTextContent("AdministraciónSucursales");
    expect(within(ubicacion).getByText("Sucursales")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveTextContent("Contenido de la pantalla");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("vpruebas");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el botón del encabezado abre el menú con el buscador listo y lo vuelve a cerrar", async () => {
    const { usuario } = renderizarLayout();
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));

    expect(within(menu()).getByRole("combobox", { name: "Buscar pantalla" })).toHaveFocus();
    await usuario.click(screen.getByRole("button", { name: "Cerrar menú" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("muestra solo las pantallas permitidas y marca la actual", async () => {
    const { usuario } = renderizarLayout();
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));

    expect(opcion("Sucursales")).toHaveAttribute("aria-current", "page");
    expect(opcion("Empresa")).not.toHaveAttribute("aria-disabled");
    expect(opcion(/Libro diario/)).toHaveAttribute("aria-disabled", "true");
    expect(opcion(/Libro diario/)).toHaveTextContent("S2");
    expect(within(menu()).queryByRole("option", { name: /Usuarios y roles/ })).not.toBeInTheDocument();
  });

  it("al elegir una pantalla navega y cierra el menú", async () => {
    const { usuario } = renderizarLayout();
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));
    await usuario.click(opcion("Empresa"));

    expect(window.location.pathname).toBe("/empresas/e1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("una pantalla de un sprint futuro avisa cuándo llega y no navega", async () => {
    const { usuario } = renderizarLayout();
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));
    await usuario.click(opcion(/Libro mayor/));

    expect(toast).toHaveBeenCalledWith("«Libro mayor» llega en el Sprint 2.");
    expect(window.location.pathname).toBe("/");
  });

  it("se busca y se abre con el teclado", async () => {
    const { usuario } = renderizarLayout();
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));

    await usuario.keyboard("libro");
    expect(opcion(/Libro diario/)).toHaveAttribute("aria-selected", "true");
    await usuario.keyboard("{ArrowDown}");
    expect(opcion(/Libro mayor/)).toHaveAttribute("aria-selected", "true");
    await usuario.keyboard("{ArrowUp}{ArrowUp}");
    expect(opcion(/Libro mayor/)).toHaveAttribute("aria-selected", "true");

    await usuario.clear(within(menu()).getByRole("combobox"));
    await usuario.keyboard("sucur{Enter}");
    expect(window.location.pathname).toBe("/empresas/e1/sucursales");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("avisa cuando la búsqueda no encuentra pantallas", async () => {
    const { usuario } = renderizarLayout();
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));
    await usuario.keyboard("zzz");
    expect(within(menu()).getByText("No hay pantallas con «zzz».")).toBeInTheDocument();
  });

  it("Ctrl K abre y cierra el menú, «/» lo abre y Escape lo cierra", async () => {
    const { usuario } = renderizarLayout();
    await usuario.keyboard("{Control>}k{/Control}");
    expect(menu()).toBeInTheDocument();
    await usuario.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await usuario.keyboard("/");
    expect(menu()).toBeInTheDocument();
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«/» no abre el menú mientras se escribe en un campo", async () => {
    const { usuario } = renderizar(
      <LayoutPrincipal ruta="/empresas/e1" empresaId="e1">
        <input aria-label="Nombre" />
      </LayoutPrincipal>,
      { permisos: PERMISOS },
    );
    await usuario.type(screen.getByRole("textbox", { name: "Nombre" }), "a/b");
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("a/b");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin empresa activa pide registrar o elegir una", async () => {
    const { usuario } = renderizar(
      <LayoutPrincipal ruta="/empresas/nueva">
        <p>Registro</p>
      </LayoutPrincipal>,
    );
    expect(screen.getByRole("navigation", { name: "Ubicación" })).toHaveTextContent("Sistema Contable");
    await usuario.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(within(menu()).getByText("Registra o elige una empresa para ver el menú.")).toBeInTheDocument();
  });
});
