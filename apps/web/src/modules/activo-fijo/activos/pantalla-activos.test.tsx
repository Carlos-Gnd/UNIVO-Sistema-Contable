import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { ActivoFijoVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaActivos } from "./pantalla-activos";
import { cuentasDePago } from "./cuentas-de-pago";

const E = "e1";
const LISTA = `GET /empresas/${E}/activos-fijos`;
const CUENTAS = `GET /empresas/${E}/cuentas`;
const SUCURSALES = `GET /empresas/${E}/sucursales`;
const ALTA = `POST /empresas/${E}/activos-fijos`;
const CONTADOR: CodigoPermiso[] = ["activo_fijo.ver", "activo_fijo.registrar", "catalogo.ver"];
const CONSULTA: CodigoPermiso[] = ["activo_fijo.ver"];

const C1 = "c0000000-0000-4000-8000-000000000001";
const C2 = "c0000000-0000-4000-8000-000000000002";
const C3 = "c0000000-0000-4000-8000-000000000003";
const C4 = "c0000000-0000-4000-8000-000000000004";
const S1 = "50000000-0000-4000-8000-000000000001";
const cuenta = (id: string, codigo: string, nombre: string, cuentaPadreId: string | null = null) => ({
  id,
  codigo,
  nombre,
  nivel: 0,
  naturaleza: "deudora",
  tipo: "activo",
  cuentaPadreId,
  activa: true,
});
const CATALOGO = [
  cuenta(C1, "1101", "Efectivo y equivalentes"),
  cuenta(C2, "110103", "Bancos", C1),
  cuenta(C3, "120105", "Mobiliario y Equipo"),
  cuenta(C4, "2101", "Proveedores"),
];
const SUCURSAL = {
  id: S1,
  empresaId: E,
  nombre: "Casa matriz",
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "0001",
  direccion: null,
  esMatriz: true,
  activa: true,
  creadoEn: "",
  actualizadoEn: "",
};
const CUENTA_VISTA = (codigo: string) => ({ id: codigo, codigo, nombre: codigo });

const activo = (extra: Partial<ActivoFijoVista> = {}): ActivoFijoVista => ({
  id: "a1",
  codigo: "AF-0001",
  nombre: "Mobiliario de oficina",
  categoria: "mobiliario_equipo",
  sucursalId: S1,
  sucursalNombre: "Casa matriz",
  costo: "2500.00",
  valorResidual: "0.00",
  fechaAdquisicion: "2026-10-01",
  vidaUtilAnios: 2,
  tasaAnual: "50.00",
  depreciacionAcumulada: "104.17",
  valorEnLibros: "2395.83",
  estado: "activo",
  ultimoMesDepreciado: "2026-10-01",
  fechaBaja: null,
  cuentaActivo: CUENTA_VISTA("120105"),
  cuentaDepreciacion: CUENTA_VISTA("120204"),
  cuentaGasto: CUENTA_VISTA("420122"),
  partidaAltaId: null,
  partidaBajaId: null,
  ...extra,
});

const abrir = (permisos: CodigoPermiso[] = CONTADOR) =>
  renderizar(<PantallaActivos parametros={{ empresaId: E }} />, { permisos });

/** El botón se habilita cuando ya llegaron el catálogo y las sucursales que necesita el formulario. */
async function botonNuevoListo() {
  const boton = await screen.findByRole("button", { name: "Nuevo activo" });
  await waitFor(() => expect(boton).toBeEnabled());
  return boton;
}

describe("pantalla de activos fijos (S3-T128)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 24, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("lista los activos con su costo, valor en libros y el total", async () => {
    simularApi({
      [LISTA]: {
        cuerpo: [
          activo(),
          activo({
            id: "a2",
            codigo: "AF-0002",
            nombre: "Laptop",
            costo: "1200.00",
            valorEnLibros: "1200.00",
          }),
        ],
      },
      [CUENTAS]: { cuerpo: CATALOGO },
      [SUCURSALES]: { cuerpo: [SUCURSAL] },
    });
    abrir();

    expect(await screen.findByRole("button", { name: "Ver el activo AF-0001" })).toBeInTheDocument();
    const fila = screen.getByRole("row", { name: /AF-0001/ });
    expect(within(fila).getByText("2 años")).toBeInTheDocument();
    expect(within(fila).getByText("2,395.83")).toBeInTheDocument();
    expect(within(screen.getAllByRole("row").at(-1)!).getByText("3,700.00")).toBeInTheDocument();
  });

  it("quien solo consulta ve la lista sin el botón de nuevo activo ni consulta el catálogo", async () => {
    const peticiones = simularApi({ [LISTA]: { cuerpo: [activo()] } });
    abrir(CONSULTA);

    await screen.findByRole("button", { name: "Ver el activo AF-0001" });
    expect(screen.queryByRole("button", { name: "Nuevo activo" })).not.toBeInTheDocument();
    expect(peticiones.map((p) => p.ruta)).toEqual([`/empresas/${E}/activos-fijos`]);
  });

  it("registra un activo con la forma de pago y avisa la partida generada", async () => {
    const peticiones = simularApi({
      [LISTA]: { cuerpo: [] },
      [CUENTAS]: { cuerpo: CATALOGO },
      [SUCURSALES]: { cuerpo: [SUCURSAL] },
      [ALTA]: {
        estado: 201,
        cuerpo: {
          activo: activo({ id: "a9", codigo: "AF-0009" }),
          partida: { id: "p1", numero: 41, ambito: "2026" },
        },
      },
    });
    const { usuario } = abrir();

    await usuario.click(await botonNuevoListo());
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo activo fijo" });
    await usuario.type(within(dialogo).getByLabelText("Nombre del activo"), "Laptop");
    await usuario.type(within(dialogo).getByLabelText("Costo (US$)"), "1200");
    await usuario.selectOptions(within(dialogo).getByLabelText("Cómo se registró la compra"), C2);
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar activo" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    const envio = peticiones.find((p) => p.metodo === "POST")!;
    expect(envio.cuerpo).toMatchObject({
      nombre: "Laptop",
      categoria: "mobiliario_equipo",
      sucursalId: S1,
      costo: "1200.00",
      valorResidual: "0.00",
      fechaAdquisicion: "2026-11-24",
      vidaUtilAnios: 2,
      contrapartidaId: C2,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("no envía un activo con costo vacío ni con vida menor a la que permite su categoría", async () => {
    const peticiones = simularApi({
      [LISTA]: { cuerpo: [] },
      [CUENTAS]: { cuerpo: CATALOGO },
      [SUCURSALES]: { cuerpo: [SUCURSAL] },
    });
    const { usuario } = abrir();

    await usuario.click(await botonNuevoListo());
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Nombre del activo"), "Camión");
    await usuario.selectOptions(within(dialogo).getByLabelText("Categoría"), "equipo_transporte");
    // la vida sugerida sube a 4 años; con 2 la categoría excede el 25 % fiscal
    expect(within(dialogo).getByLabelText("Vida útil (años)")).toHaveValue("4");
    await usuario.clear(within(dialogo).getByLabelText("Vida útil (años)"));
    await usuario.type(within(dialogo).getByLabelText("Vida útil (años)"), "2");
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar activo" }));

    expect(within(dialogo).getByLabelText("Vida útil (años)")).toHaveAccessibleDescription(
      /vida útil mínima/i,
    );
    expect(within(dialogo).getByLabelText("Costo (US$)")).toHaveAccessibleDescription(
      "El costo debe ser mayor que cero.",
    );
    expect(peticiones.filter((p) => p.metodo === "POST")).toHaveLength(0);
  });

  it("da de baja desde el detalle mostrando la pérdida sobre el valor en libros", async () => {
    const peticiones = simularApi({
      [LISTA]: { cuerpo: [activo()] },
      [CUENTAS]: { cuerpo: CATALOGO },
      [SUCURSALES]: { cuerpo: [SUCURSAL] },
      [`POST /empresas/${E}/activos-fijos/a1/baja`]: {
        cuerpo: {
          activo: activo({ estado: "de_baja", fechaBaja: "2026-11-24" }),
          partida: { id: "p2", numero: 50, ambito: "2026" },
        },
      },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Ver el activo AF-0001" }));
    await usuario.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Dar de baja" }),
    );
    const baja = await screen.findByRole("dialog", { name: "Dar de baja AF-0001" });
    // depreciación 104.17 al debe, pérdida por el valor en libros 2,395.83 al debe y el costo 2,500 al haber
    expect(within(baja).getByText("104.17")).toBeInTheDocument();
    expect(within(baja).getByText("2,395.83")).toBeInTheDocument();
    expect(within(baja).getByText("2,500.00")).toBeInTheDocument();
    await usuario.click(within(baja).getByRole("button", { name: "Dar de baja" }));

    await waitFor(() =>
      expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({ fecha: "2026-11-24" }),
    );
  });
});

describe("cuentas de pago", () => {
  it("ofrece efectivo, bancos y pasivos de último nivel, sin las cuentas con subcuentas", () => {
    const codigos = cuentasDePago(CATALOGO as never).map((c) => c.codigo);
    expect(codigos).toEqual(["110103", "2101"]);
  });
});
