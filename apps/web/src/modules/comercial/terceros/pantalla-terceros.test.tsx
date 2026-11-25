import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { TerceroVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaTerceros } from "./pantalla-terceros";

const E = "e1";
const ADMIN: CodigoPermiso[] = ["terceros.ver", "terceros.registrar"];
const SOLO_VER: CodigoPermiso[] = ["terceros.ver"];
const LISTA = `GET /empresas/${E}/terceros`;

const tercero = (id: string, nombre: string, extra: Partial<TerceroVista> = {}): TerceroVista => ({
  id,
  nombre,
  nit: "1234-567890-123-0",
  nrc: "245871-4",
  actividadEconomica: "Venta de equipo de telefonía",
  clasificacion: "mediano",
  direccion: null,
  telefono: null,
  correo: null,
  esCliente: true,
  esProveedor: false,
  diasCredito: 0,
  activo: true,
  ...extra,
});

const TECNO = tercero("t1", "Tecno Plaza San Miguel");
const TOTALYNK = tercero("t2", "Totalynk El Salvador", {
  clasificacion: "grande",
  nrc: null,
  esCliente: false,
  esProveedor: true,
  activo: false,
});

const abrir = (permisos: CodigoPermiso[] = ADMIN) =>
  renderizar(<PantallaTerceros parametros={{ empresaId: E }} />, { permisos });

describe("pantalla de clientes y proveedores (HU-58, S3-T59)", () => {
  it("lista los clientes con NIT, NRC y clasificación, y cambia a proveedores", async () => {
    const peticiones = simularApi({
      [LISTA]: ({ consulta }) => ({ cuerpo: consulta.get("rol") === "proveedor" ? [TOTALYNK] : [TECNO] }),
    });
    const { usuario } = abrir();

    const fila = (await screen.findByText("Tecno Plaza San Miguel")).closest("tr")!;
    expect(within(fila).getByText("1234-567890-123-0")).toBeInTheDocument();
    expect(within(fila).getByText("245871-4")).toBeInTheDocument();
    expect(within(fila).getByText("Mediano contribuyente")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Proveedores" }));
    const proveedor = (await screen.findByText("Totalynk El Salvador")).closest("tr")!;
    expect(within(proveedor).getByText("Gran contribuyente")).toBeInTheDocument();
    expect(within(proveedor).getByText("Inactivo")).toBeInTheDocument();
    expect(
      peticiones
        .filter((p) => p.ruta === `/empresas/${E}/terceros`)
        .at(-1)
        ?.consulta.get("rol"),
    ).toBe("proveedor");
  });

  it("sin permiso de registrar solo se consulta", async () => {
    simularApi({ [LISTA]: { cuerpo: [TECNO] } });
    abrir(SOLO_VER);

    await screen.findByText("Tecno Plaza San Miguel");
    expect(screen.queryByRole("button", { name: "Nuevo cliente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar / })).not.toBeInTheDocument();
  });

  it("envía la búsqueda y el estado a la API", async () => {
    const peticiones = simularApi({ [LISTA]: { cuerpo: [TECNO] } });
    const { usuario } = abrir();
    await screen.findByText("Tecno Plaza San Miguel");

    await usuario.type(screen.getByRole("searchbox", { name: "Buscar por nombre, NIT o NRC" }), "2458");
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "activos");

    await waitFor(() => {
      const ultima = peticiones.filter((p) => p.ruta === `/empresas/${E}/terceros`).at(-1)!;
      expect(Object.fromEntries(ultima.consulta)).toEqual({
        rol: "cliente",
        busqueda: "2458",
        activo: "true",
      });
    });
  });

  it("crea un cliente con el NIT dado formato y lo marca como cliente", async () => {
    const peticiones = simularApi({
      [LISTA]: { cuerpo: [] },
      [`POST /empresas/${E}/terceros`]: ({ cuerpo }) => ({
        estado: 201,
        cuerpo: tercero("t9", (cuerpo as { nombre: string }).nombre),
      }),
    });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay registros/);

    await usuario.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Nombre o razón social"), "Cliente Nuevo");
    await usuario.type(within(dialogo).getByLabelText("NIT"), "12345678901230");
    await usuario.type(within(dialogo).getByLabelText(/^NRC/), "2458714");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({
      nombre: "Cliente Nuevo",
      nit: "1234-567890-123-0",
      nrc: "245871-4",
      clasificacion: "otro",
      esCliente: true,
      esProveedor: false,
    });
  });

  it("valida el NIT en el formulario antes de enviar", async () => {
    const peticiones = simularApi({ [LISTA]: { cuerpo: [] } });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay registros/);

    await usuario.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Nombre o razón social"), "Cliente Nuevo");
    await usuario.type(within(dialogo).getByLabelText("NIT"), "1234-567890-123-1");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByText(/dígito verificador/)).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("muestra el NIT repetido que devuelve la API", async () => {
    simularApi({
      [LISTA]: { cuerpo: [TECNO] },
      [`POST /empresas/${E}/terceros`]: {
        estado: 409,
        cuerpo: { message: "Ya existe un cliente o proveedor con el NIT 1234-567890-123-0 en esta empresa." },
      },
    });
    const { usuario } = abrir();
    await screen.findByText("Tecno Plaza San Miguel");

    await usuario.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Nombre o razón social"), "Otro");
    await usuario.type(within(dialogo).getByLabelText("NIT"), "1234-567890-123-0");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(
      await within(dialogo).findByText(/Ya existe un cliente o proveedor con el NIT/),
    ).toBeInTheDocument();
  });

  it("edita solo el campo que cambió e inactiva con un clic", async () => {
    const peticiones = simularApi({
      [LISTA]: { cuerpo: [TECNO] },
      [`PATCH /empresas/${E}/terceros/t1`]: { cuerpo: TECNO },
    });
    const { usuario } = abrir();
    await screen.findByText("Tecno Plaza San Miguel");

    await usuario.click(screen.getByRole("button", { name: "Editar Tecno Plaza San Miguel" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.selectOptions(within(dialogo).getByLabelText("Clasificación"), "grande");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ clasificacion: "grande" });

    await usuario.click(screen.getByRole("button", { name: "Inactivar Tecno Plaza San Miguel" }));
    await waitFor(() => expect(peticiones.filter((p) => p.metodo === "PATCH")).toHaveLength(2));
    expect(peticiones.filter((p) => p.metodo === "PATCH")[1]?.cuerpo).toEqual({ activo: false });
  });
});
