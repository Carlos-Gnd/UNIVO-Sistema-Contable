import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { CuentaTesoreriaVista, SucursalDetalle } from "@contable/shared";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { cuentasDeEfectivoLibres } from "./cuentas-efectivo";
import { PantallaCuentasTesoreria } from "./pantalla-cuentas-tesoreria";

const E = "e1";
const GESTIONAR: CodigoPermiso[] = ["tesoreria.ver", "tesoreria.registrar"];
const VER: CodigoPermiso[] = ["tesoreria.ver"];
// Los identificadores de la API son UUID: el formulario valida con el mismo esquema que el servidor
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [C_CAJA, C_BANCO, C_AHORRO, C_BANCOS_PADRE, S_MATRIZ] = [ID(1), ID(2), ID(3), ID(4), ID(5)];

const LISTA = `GET /empresas/${E}/cuentas-tesoreria`;
const CATALOGO = `GET /empresas/${E}/cuentas`;

const cuenta = (
  id: string,
  codigo: string,
  nombre: string,
  extra: Partial<CuentaCatalogo> = {},
): CuentaCatalogo => ({
  id,
  codigo,
  nombre,
  nivel: 3,
  naturaleza: "deudora",
  tipo: "activo",
  cuentaPadreId: null,
  activa: true,
  ...extra,
});
const CATALOGO_EFECTIVO = [
  cuenta(ID(10), "1101", "Efectivo y equivalentes"),
  cuenta(C_CAJA, "110101", "Caja general", { cuentaPadreId: ID(10) }),
  cuenta(C_BANCOS_PADRE, "110103", "Bancos", { cuentaPadreId: ID(10) }),
  cuenta(C_BANCO, "11010301", "Cuenta corriente", { cuentaPadreId: C_BANCOS_PADRE }),
  cuenta(C_AHORRO, "11010302", "Cuenta de ahorro", { cuentaPadreId: C_BANCOS_PADRE }),
  cuenta(ID(11), "5101", "Ventas"),
];

const vista = (id: string, extra: Partial<CuentaTesoreriaVista>): CuentaTesoreriaVista => ({
  id,
  tipo: "caja",
  nombre: "Caja general",
  banco: null,
  numeroCuenta: null,
  cuentaId: C_CAJA,
  cuentaCodigo: "110101",
  cuentaNombre: "Caja general",
  sucursalId: null,
  sucursal: null,
  activa: true,
  saldo: "449.75",
  ...extra,
});
const CAJA = vista(ID(20), {});
const BANCO = vista(ID(21), {
  tipo: "banco",
  nombre: "Banco Agrícola corriente",
  banco: "Banco Agrícola",
  numeroCuenta: "001-234567-8",
  cuentaId: C_BANCO,
  cuentaCodigo: "11010301",
  cuentaNombre: "Cuenta corriente",
  sucursalId: S_MATRIZ,
  sucursal: "Casa matriz",
  saldo: "12000.50",
});
const INACTIVA = vista(ID(22), { nombre: "Caja vieja", cuentaId: ID(30), activa: false, saldo: "999.00" });

const MATRIZ: SucursalDetalle = {
  id: S_MATRIZ,
  empresaId: E,
  nombre: "Casa matriz",
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz: true,
  activa: true,
  creadoEn: "2026-11-10T00:00:00.000Z",
  actualizadoEn: "2026-11-10T00:00:00.000Z",
};

function api(extra: Parameters<typeof simularApi>[0] = {}, lista = [CAJA, BANCO, INACTIVA]) {
  return simularApi({
    [LISTA]: { cuerpo: lista },
    [CATALOGO]: { cuerpo: CATALOGO_EFECTIVO },
    [`GET /empresas/${E}/sucursales`]: { cuerpo: [MATRIZ] },
    ...extra,
  });
}

const abrir = (permisos: CodigoPermiso[] = GESTIONAR, todasSucursales = true) =>
  renderizar(<PantallaCuentasTesoreria parametros={{ empresaId: E }} />, { permisos, todasSucursales });

describe("cuentas de efectivo disponibles", () => {
  it("solo ofrece subcuentas 1101 de último nivel, activas y sin caja o banco", () => {
    const libres = cuentasDeEfectivoLibres(CATALOGO_EFECTIVO, new Set([C_CAJA]));
    expect(libres.map((c) => c.codigo)).toEqual(["11010301", "11010302"]);
  });
});

describe("pantalla de caja y bancos (HU-76, S3-T113)", () => {
  it("lista cada caja y cuenta con su cuenta contable, sucursal, estado y saldo", async () => {
    api();
    abrir();
    const fila = (await screen.findByText("Banco Agrícola corriente")).closest("tr")!;
    expect(within(fila).getByText("Banco Agrícola")).toBeInTheDocument();
    expect(within(fila).getByText("001-234567-8")).toBeInTheDocument();
    expect(within(fila).getByText("11010301")).toBeInTheDocument();
    expect(within(fila).getByText("Casa matriz")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 12,000.50")).toBeInTheDocument();
    const caja = screen.getByText("Caja general", { selector: "td.font-medium" }).closest("tr")!;
    expect(within(caja).getByText("Toda la empresa")).toBeInTheDocument();
    expect(within(caja).getByText("US$ 449.75")).toBeInTheDocument();
    expect(within(screen.getByText("Caja vieja").closest("tr")!).getByText("Inactiva")).toBeInTheDocument();
  });

  it("el efectivo total suma solo las cuentas activas", async () => {
    api();
    abrir();
    // 449.75 + 12,000.50; la caja inactiva no cuenta
    expect(await screen.findByLabelText("Efectivo total")).toHaveTextContent("US$ 12,450.25");
  });

  it("sin permiso de tesorería avisa y no consulta nada", async () => {
    const peticiones = api();
    abrir([]);
    expect(
      await screen.findByText("Tu rol no permite consultar caja y bancos en esta empresa."),
    ).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("quien solo consulta ve los saldos pero no puede crear, editar ni inactivar", async () => {
    api();
    abrir(VER);
    await screen.findByText("Banco Agrícola corriente");
    expect(screen.queryByRole("button", { name: "Nueva caja o cuenta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inactivar/ })).not.toBeInTheDocument();
  });

  it("muestra el estado vacío", async () => {
    api({}, []);
    abrir();
    expect(await screen.findByText(/Todavía no hay cajas ni cuentas bancarias/)).toBeInTheDocument();
  });

  it("registra una caja vinculada a una cuenta de efectivo libre", async () => {
    const peticiones = api(
      {
        [`POST /empresas/${E}/cuentas-tesoreria`]: {
          estado: 201,
          cuerpo: vista(ID(23), { nombre: "Caja de ventas" }),
        },
      },
      [BANCO],
    );
    const { usuario } = abrir();
    await screen.findByText("Banco Agrícola corriente");
    await usuario.click(screen.getByRole("button", { name: "Nueva caja o cuenta" }));
    const dialogo = await screen.findByRole("dialog");
    // las cuentas con subcuentas, de otro tipo o ya usadas no se ofrecen
    await within(dialogo).findByRole("option", { name: "110101 Caja general" });
    expect(within(dialogo).queryByRole("option", { name: "110103 Bancos" })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("option", { name: /5101/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("option", { name: /11010301/ })).not.toBeInTheDocument();

    await usuario.type(within(dialogo).getByLabelText("Nombre"), "Caja de ventas");
    await usuario.selectOptions(within(dialogo).getByLabelText("Cuenta contable"), C_CAJA);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
      tipo: "caja",
      nombre: "Caja de ventas",
      cuentaId: C_CAJA,
    });
  });

  it("un banco pide entidad y número y los envía con la sucursal elegida", async () => {
    const peticiones = api({ [`POST /empresas/${E}/cuentas-tesoreria`]: { estado: 201, cuerpo: BANCO } }, [
      CAJA,
    ]);
    const { usuario } = abrir();
    await screen.findByText("Caja general", { selector: "td.font-medium" });
    await usuario.click(screen.getByRole("button", { name: "Nueva caja o cuenta" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByRole("option", { name: /11010301/ });
    await usuario.selectOptions(within(dialogo).getByLabelText("Tipo"), "banco");
    await usuario.type(within(dialogo).getByLabelText("Nombre"), "Banco Agrícola corriente");
    await usuario.selectOptions(within(dialogo).getByLabelText("Cuenta contable"), C_BANCO);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByText("El banco es obligatorio.")).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);

    await usuario.type(within(dialogo).getByLabelText("Banco"), "Banco Agrícola");
    await usuario.type(within(dialogo).getByLabelText("Número de cuenta"), "001-234567-8");
    await usuario.selectOptions(within(dialogo).getByLabelText("Sucursal"), S_MATRIZ);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
      tipo: "banco",
      nombre: "Banco Agrícola corriente",
      cuentaId: C_BANCO,
      sucursalId: S_MATRIZ,
      banco: "Banco Agrícola",
      numeroCuenta: "001-234567-8",
    });
  });

  it("muestra el rechazo de la API, por ejemplo un número de cuenta repetido", async () => {
    api(
      {
        [`POST /empresas/${E}/cuentas-tesoreria`]: {
          estado: 409,
          cuerpo: { message: "Ya existe la cuenta 001 del banco Banco X en esta empresa." },
        },
      },
      [],
    );
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay cajas/);
    await usuario.click(screen.getByRole("button", { name: "Nueva caja o cuenta" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByRole("option", { name: /110101/ });
    await usuario.type(within(dialogo).getByLabelText("Nombre"), "Caja");
    await usuario.selectOptions(within(dialogo).getByLabelText("Cuenta contable"), C_CAJA);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByText(/Ya existe la cuenta 001/)).toBeInTheDocument();
  });

  it("al editar, el tipo y la cuenta contable quedan fijos y solo se envía lo que cambió", async () => {
    const peticiones = api({
      [`PATCH /empresas/${E}/cuentas-tesoreria/${CAJA.id}`]: {
        cuerpo: { ...CAJA, nombre: "Caja principal" },
      },
    });
    const { usuario } = abrir();
    await screen.findByText("Banco Agrícola corriente");

    await usuario.click(screen.getByRole("button", { name: "Editar Caja general" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByLabelText("Tipo")).toBeDisabled();
    expect(within(dialogo).queryByLabelText("Cuenta contable")).not.toBeInTheDocument();
    expect(within(dialogo).getByText(/110101 Caja general/)).toBeInTheDocument();
    const nombre = within(dialogo).getByLabelText("Nombre");
    await usuario.clear(nombre);
    await usuario.type(nombre, "Caja principal");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ nombre: "Caja principal" });
  });

  it("inactiva una cuenta con un solo clic", async () => {
    const peticiones = api({
      [`PATCH /empresas/${E}/cuentas-tesoreria/${CAJA.id}`]: { cuerpo: { ...CAJA, activa: false } },
    });
    const { usuario } = abrir();
    await screen.findByText("Banco Agrícola corriente");
    await usuario.click(screen.getByRole("button", { name: "Inactivar Caja general" }));
    await waitFor(() => expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ activa: false });
  });

  it("quien solo ve algunas sucursales no ofrece la empresa completa al registrar", async () => {
    api();
    const { usuario } = renderizar(<PantallaCuentasTesoreria parametros={{ empresaId: E }} />, {
      permisos: GESTIONAR,
      todasSucursales: false,
      sucursales: [S_MATRIZ],
    });
    await screen.findByText("Banco Agrícola corriente");
    await usuario.click(screen.getByRole("button", { name: "Nueva caja o cuenta" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByRole("option", { name: "Casa matriz" });
    expect(within(dialogo).queryByRole("option", { name: "Toda la empresa" })).not.toBeInTheDocument();
  });
});
