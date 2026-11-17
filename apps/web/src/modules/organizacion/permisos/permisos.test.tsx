import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { simularApi } from "@/test/api-simulada";
import { crearClientePruebas, renderizar } from "@/test/render";
import { Permiso, PermisosProvider, tienePermiso, usePermiso, usePermisos, usePuedeUsarSucursal } from ".";
import type { CodigoPermiso } from "./codigos";

const conProveedor =
  (empresaId = "e1") =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={crearClientePruebas()}>
      <PermisosProvider empresaId={empresaId}>{children}</PermisosProvider>
    </QueryClientProvider>
  );

describe("tienePermiso", () => {
  const concedidos = new Set<CodigoPermiso>(["partidas.ver", "partidas.registrar"]);

  it("exige todos los permisos por defecto", () => {
    expect(tienePermiso(concedidos, ["partidas.ver", "partidas.registrar"])).toBe(true);
    expect(tienePermiso(concedidos, ["partidas.ver", "partidas.contabilizar"])).toBe(false);
  });

  it("con modo alguno basta uno", () => {
    expect(tienePermiso(concedidos, ["partidas.contabilizar", "partidas.ver"], { modo: "alguno" })).toBe(
      true,
    );
    expect(tienePermiso(concedidos, ["partidas.contabilizar", "periodos.cerrar"], { modo: "alguno" })).toBe(
      false,
    );
  });
});

describe("usePermiso con la API", () => {
  it("concede los permisos que devuelve la API para la empresa", async () => {
    simularApi({
      "GET /empresas/e1/mis-permisos": {
        cuerpo: {
          rol: "auxiliar",
          todasSucursales: false,
          sucursales: ["s1"],
          permisos: ["partidas.ver", "partidas.registrar"],
        },
      },
    });

    const { result } = renderHook(
      () => ({
        registrar: usePermiso("partidas.registrar"),
        contabilizar: usePermiso("partidas.contabilizar"),
        sucursalPropia: usePuedeUsarSucursal("s1"),
        otraSucursal: usePuedeUsarSucursal("s2"),
        rol: usePermisos().rol,
      }),
      { wrapper: conProveedor() },
    );

    await vi.waitFor(() => expect(result.current.rol).toBe("auxiliar"));
    expect(result.current).toEqual({
      registrar: true,
      contabilizar: false,
      sucursalPropia: true,
      otraSucursal: false,
      rol: "auxiliar",
    });
  });

  it("niega todo mientras carga y si la consulta falla", async () => {
    simularApi({ "GET /empresas/e1/mis-permisos": { estado: 500 } });

    const { result } = renderHook(() => ({ ver: usePermiso("empresa.ver"), estado: usePermisos().estado }), {
      wrapper: conProveedor(),
    });

    expect(result.current).toEqual({ ver: false, estado: "cargando" });
    await vi.waitFor(() => expect(result.current.estado).toBe("error"));
    expect(result.current.ver).toBe(false);
  });

  it("descarta permisos desconocidos sin romperse", async () => {
    simularApi({
      "GET /empresas/e1/mis-permisos": {
        cuerpo: {
          rol: "consulta",
          todasSucursales: false,
          sucursales: [],
          permisos: ["algo.nuevo", "empresa.ver"],
        },
      },
    });
    const { result } = renderHook(() => usePermisos(), { wrapper: conProveedor() });
    await vi.waitFor(() => expect(result.current.estado).toBe("listo"));
    expect([...result.current.permisos]).toEqual(["empresa.ver"]);
  });

  it("exige el proveedor", () => {
    expect(() => renderHook(() => usePermiso("empresa.ver"))).toThrow(/PermisosProvider/);
  });
});

describe("<Permiso>", () => {
  it("oculta lo que el rol no permite y muestra la alternativa", () => {
    renderizar(
      <>
        <Permiso requiere="partidas.registrar">
          <button type="button">Nueva partida</button>
        </Permiso>
        <Permiso requiere="partidas.contabilizar" alternativa={<p>Solo el contador contabiliza.</p>}>
          <button type="button">Contabilizar</button>
        </Permiso>
      </>,
      { permisos: ["partidas.ver", "partidas.registrar"] },
    );

    expect(screen.getByRole("button", { name: "Nueva partida" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contabilizar" })).not.toBeInTheDocument();
    expect(screen.getByText("Solo el contador contabiliza.")).toBeInTheDocument();
  });

  it("no muestra nada mientras los permisos cargan", () => {
    render(
      <QueryClientProvider client={crearClientePruebas()}>
        <PermisosProvider empresaId="sin-respuesta">
          <Permiso requiere="empresa.ver">
            <span>visible</span>
          </Permiso>
        </PermisosProvider>
      </QueryClientProvider>,
    );
    // Sin respuesta de la API todavía: nada se muestra
    expect(screen.queryByText("visible")).not.toBeInTheDocument();
  });
});
