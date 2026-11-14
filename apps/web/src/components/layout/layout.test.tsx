import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import type { DefinicionRuta } from "@/app/rutas";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { renderizar } from "@/test/render";
import { gruposVisibles, opcionActiva } from "./opciones-menu";
import { LayoutPrincipal } from "./layout-principal";

const Vacia = () => null;
const ruta = (patron: string): DefinicionRuta => ({ patron, componente: Vacia });

const RUTAS_PRUEBA = [
  ruta("/empresas/:empresaId"),
  ruta("/empresas/:empresaId/sucursales"),
  ruta("/empresas/:empresaId/partidas"),
  ruta("/empresas/:empresaId/partidas/nueva"),
  ruta("/empresas/:empresaId/partidas/:partidaId"),
];

const TODOS: ReadonlySet<CodigoPermiso> = new Set([
  "empresa.ver",
  "sucursales.ver",
  "partidas.ver",
  "partidas.registrar",
]);

describe("gruposVisibles", () => {
  it("muestra solo las opciones con pantalla registrada", () => {
    const grupos = gruposVisibles("e1", { rutas: RUTAS_PRUEBA });
    const ids = grupos.flatMap((g) => g.opciones.map((o) => o.id));
    expect(ids).toEqual(["empresa", "sucursales", "bandeja", "nuevaPartida"]);
    expect(grupos.find((g) => g.id === "organizacion")?.opciones[1]?.href).toBe("/empresas/e1/sucursales");
  });

  it("oculta las opciones sin permiso y los grupos que quedan vacíos", () => {
    const grupos = gruposVisibles("e1", {
      rutas: RUTAS_PRUEBA,
      permisos: new Set<CodigoPermiso>(["partidas.ver"]),
    });
    expect(grupos.map((g) => g.id)).toEqual(["contabilidad"]);
    expect(grupos[0]?.opciones.map((o) => o.id)).toEqual(["bandeja"]);
  });

  it("codifica el identificador de la empresa en la ruta", () => {
    const [grupo] = gruposVisibles("a/b", { rutas: [ruta("/empresas/:empresaId")] });
    expect(grupo?.opciones[0]?.href).toBe("/empresas/a%2Fb");
  });
});

describe("opcionActiva", () => {
  const grupos = gruposVisibles("e1", { rutas: RUTAS_PRUEBA, permisos: TODOS });

  it("elige la opción de ruta más larga que contiene la ruta actual", () => {
    expect(opcionActiva("/empresas/e1/partidas/nueva", grupos)?.id).toBe("nuevaPartida");
    expect(opcionActiva("/empresas/e1/partidas/abc", grupos)?.id).toBe("bandeja");
    expect(opcionActiva("/empresas/e1/sucursales/", grupos)?.id).toBe("sucursales");
  });

  it("la opción de empresa solo se activa en su ruta exacta", () => {
    expect(opcionActiva("/empresas/e1", grupos)?.id).toBe("empresa");
    expect(opcionActiva("/empresas/e1/otra", grupos)).toBeNull();
  });
});

describe("LayoutPrincipal", () => {
  it("muestra el menú con las opciones permitidas y marca la actual", () => {
    renderizar(
      <LayoutPrincipal ruta="/empresas/e1/sucursales" empresaId="e1">
        <p>Contenido de la pantalla</p>
      </LayoutPrincipal>,
      { permisos: ["empresa.ver", "sucursales.ver"] },
    );

    const menu = screen.getByRole("navigation", { name: "Menú principal" });
    expect(within(menu).getByRole("link", { name: "Empresa" })).toHaveAttribute("href", "/empresas/e1");
    expect(within(menu).getByRole("link", { name: "Sucursales" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Ejercicios y períodos" })).toHaveAttribute(
      "href",
      "/empresas/e1/periodos",
    );
    expect(within(menu).queryByRole("link", { name: "Nueva partida" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Contenido de la pantalla");
    expect(screen.getByRole("banner")).toHaveTextContent("Sucursales");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("vpruebas");
  });

  it("sin empresa activa pide registrar o elegir una", () => {
    renderizar(
      <LayoutPrincipal ruta="/empresas/nueva">
        <p>Registro</p>
      </LayoutPrincipal>,
    );
    expect(screen.getByText("Registra o elige una empresa para ver el menú.")).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /Sucursales/ })).toHaveLength(0);
  });

  it("avisa cuando el usuario no tiene opciones en la empresa", () => {
    renderizar(
      <LayoutPrincipal ruta="/empresas/e1" empresaId="e1">
        <p>Empresa</p>
      </LayoutPrincipal>,
    );
    expect(screen.getByText("Tu usuario todavía no tiene opciones en esta empresa.")).toBeInTheDocument();
  });
});
