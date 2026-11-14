import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { SucursalDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaSucursales } from "./pantalla-sucursales";

const E = "e1";
const ADMIN: CodigoPermiso[] = ["sucursales.ver", "sucursales.gestionar"];
const LISTA = `GET /empresas/${E}/sucursales`;

const sucursal = (id: string, nombre: string, extra: Partial<SucursalDetalle> = {}): SucursalDetalle => ({
  id,
  empresaId: E,
  nombre,
  codigoEstablecimiento: "S001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz: false,
  activa: true,
  creadoEn: "2026-11-10T00:00:00.000Z",
  actualizadoEn: "2026-11-10T00:00:00.000Z",
  ...extra,
});

const MATRIZ = sucursal("s1", "Casa matriz", {
  esMatriz: true,
  codigoEstablecimiento: "M001",
  direccion: "San Miguel",
});
const USULUTAN = sucursal("s2", "Usulután", { codigoEstablecimiento: "S002" });
const LA_UNION = sucursal("s3", "La Unión", { codigoEstablecimiento: "S003", activa: false });

const abrir = (permisos: CodigoPermiso[] = ADMIN, opciones = {}) =>
  renderizar(<PantallaSucursales parametros={{ empresaId: E }} />, { permisos, ...opciones });

/** API en memoria con estado: POST agrega y PATCH modifica lo que devuelve el GET siguiente. */
function apiConEstado(inicial: SucursalDetalle[]) {
  let lista = [...inicial];
  return simularApi({
    [LISTA]: () => ({ cuerpo: lista }),
    [`POST /empresas/${E}/sucursales`]: ({ cuerpo }) => {
      const nueva = sucursal(`s${lista.length + 10}`, (cuerpo as { nombre: string }).nombre);
      lista = [...lista, nueva];
      return { estado: 201, cuerpo: nueva };
    },
    ...Object.fromEntries(
      inicial.map((x) => [
        `PATCH /empresas/${E}/sucursales/${x.id}`,
        ({ cuerpo }: { cuerpo: unknown }) => {
          lista = lista.map((y) => (y.id === x.id ? { ...y, ...(cuerpo as Partial<SucursalDetalle>) } : y));
          return { cuerpo: lista.find((y) => y.id === x.id) };
        },
      ]),
    ),
  });
}

const tarjetas = async () =>
  within(await screen.findByRole("list", { name: "Sucursales" }))
    .getAllByRole("heading")
    .map((h) => h.textContent);

describe("pantalla de sucursales (S1-T45)", () => {
  it("lista la casa matriz primero, luego las activas y al final las inactivas, con sus códigos", async () => {
    simularApi({ [LISTA]: { cuerpo: [LA_UNION, USULUTAN, MATRIZ] } });
    abrir();

    expect(await tarjetas()).toEqual(["Casa matriz", "Usulután", "La Unión"]);
    const matriz = screen.getByRole("heading", { name: "Casa matriz" }).closest("section");
    expect(matriz).toHaveTextContent("San Miguel");
    expect(matriz).toHaveTextContent("EstablecimientoM001");
    expect(screen.getByText("Inactiva")).toBeInTheDocument();
  });

  it("la casa matriz no se puede inactivar", async () => {
    simularApi({ [LISTA]: { cuerpo: [MATRIZ, USULUTAN] } });
    abrir();
    await tarjetas();

    expect(screen.queryByRole("button", { name: "Inactivar Casa matriz" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Casa matriz" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inactivar Usulután" })).toBeInTheDocument();
  });

  it("registra una sucursal con los códigos en mayúsculas", async () => {
    const peticiones = apiConEstado([MATRIZ]);
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Nueva sucursal" }));
    const dialogo = screen.getByRole("dialog", { name: "Nueva sucursal" });
    await usuario.type(within(dialogo).getByLabelText("Nombre"), "Santa Ana Centro");
    await usuario.type(within(dialogo).getByLabelText("Código de establecimiento"), "s004");
    expect(within(dialogo).getByLabelText("Punto de venta")).toHaveValue("0001");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
      nombre: "Santa Ana Centro",
      codigoEstablecimiento: "S004",
      codigoPuntoVenta: "0001",
    });
    expect(await tarjetas()).toEqual(["Casa matriz", "Santa Ana Centro"]);
  });

  it("valida los códigos con el esquema compartido antes de enviar", async () => {
    const peticiones = simularApi({ [LISTA]: { cuerpo: [MATRIZ] } });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Nueva sucursal" }));
    const dialogo = screen.getByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Código de establecimiento"), "S4");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(within(dialogo).getByLabelText("Nombre")).toHaveAccessibleDescription(
      "Este campo es obligatorio.",
    );
    expect(within(dialogo).getByLabelText("Código de establecimiento")).toHaveAccessibleDescription(
      "Debe tener 4 letras o dígitos, como 0001 o M001.",
    );
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("muestra el código duplicado que rechaza la API", async () => {
    simularApi({
      [LISTA]: { cuerpo: [MATRIZ] },
      [`POST /empresas/${E}/sucursales`]: {
        estado: 409,
        cuerpo: { message: "Ya existe una sucursal con el establecimiento M001 y punto de venta 0001." },
      },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Nueva sucursal" }));
    const dialogo = screen.getByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Nombre"), "Otra");
    await usuario.type(within(dialogo).getByLabelText("Código de establecimiento"), "M001");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Ya existe una sucursal con el establecimiento M001 y punto de venta 0001.",
    );
  });

  it("edita enviando solo lo que cambió e informa si los códigos ya no se pueden cambiar", async () => {
    const peticiones = simularApi({
      [LISTA]: { cuerpo: [MATRIZ, USULUTAN] },
      [`PATCH /empresas/${E}/sucursales/s2`]: {
        estado: 422,
        cuerpo: {
          message: "La sucursal ya tiene movimientos: sus códigos de Hacienda no se pueden cambiar.",
        },
      },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Editar Usulután" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar sucursal" });
    expect(within(dialogo).getByLabelText("Nombre")).toHaveValue("Usulután");
    await usuario.clear(within(dialogo).getByLabelText("Código de establecimiento"));
    await usuario.type(within(dialogo).getByLabelText("Código de establecimiento"), "S010");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "La sucursal ya tiene movimientos: sus códigos de Hacienda no se pueden cambiar.",
    );
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ codigoEstablecimiento: "S010" });
  });

  it("avisa cuando no hay cambios que guardar", async () => {
    const peticiones = simularApi({ [LISTA]: { cuerpo: [MATRIZ] } });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Editar Casa matriz" }));
    await usuario.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Guardar" }));

    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
      "No hay cambios que guardar.",
    );
    expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(false);
  });

  it("inactiva con confirmación y reactiva directamente", async () => {
    const peticiones = apiConEstado([MATRIZ, USULUTAN, LA_UNION]);
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Inactivar Usulután" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Inactivar Usulután?" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Inactivar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Activar Usulután" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Activar La Unión" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Inactivar La Unión" })).toBeInTheDocument(),
    );

    expect(peticiones.filter((p) => p.metodo === "PATCH").map((p) => [p.ruta, p.cuerpo])).toEqual([
      [`/empresas/${E}/sucursales/s2`, { activa: false }],
      [`/empresas/${E}/sucursales/s3`, { activa: true }],
    ]);
  });

  it("los roles sin sucursales.gestionar solo ven el listado", async () => {
    simularApi({ [LISTA]: { cuerpo: [MATRIZ, USULUTAN] } });
    abrir(["sucursales.ver"]);
    await tarjetas();

    expect(screen.queryByRole("button", { name: "Nueva sucursal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar|Inactivar/ })).not.toBeInTheDocument();
  });

  it("quien gestiona solo algunas sucursales no puede crear nuevas", async () => {
    simularApi({ [LISTA]: { cuerpo: [USULUTAN] } });
    abrir(ADMIN, { todasSucursales: false, sucursales: ["s2"] });
    await tarjetas();

    expect(screen.queryByRole("button", { name: "Nueva sucursal" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Usulután" })).toBeInTheDocument();
  });

  it("informa si no se pudieron cargar", async () => {
    simularApi({
      [LISTA]: { estado: 403, cuerpo: { message: "Su rol no permite ver las sucursales en esta empresa." } },
    });
    abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudieron cargar las sucursales. Su rol no permite ver las sucursales en esta empresa.",
    );
  });
});
