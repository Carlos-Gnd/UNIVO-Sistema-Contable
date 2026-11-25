import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { EmpleadoVista, SucursalDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaEmpleados } from "./pantalla-empleados";

const E = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const VER: CodigoPermiso[] = ["planilla.ver"];
const EDITAR: CodigoPermiso[] = ["planilla.ver", "planilla.calcular"];
const EMPLEADOS = `GET /empresas/${E}/empleados`;
const SUCURSALES = `GET /empresas/${E}/sucursales`;

const sucursal: SucursalDetalle = {
  id: S,
  empresaId: E,
  nombre: "Casa matriz",
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "0001",
  direccion: null,
  esMatriz: true,
  activa: true,
  creadoEn: "2026-01-01T00:00:00.000Z",
  actualizadoEn: "2026-01-01T00:00:00.000Z",
};

const empleado: EmpleadoVista = {
  id: "33333333-3333-4333-8333-333333333333",
  sucursalId: S,
  sucursal: "Casa matriz",
  nombres: "María",
  apellidos: "García López",
  dui: "01234567-8",
  nit: "0614-010190-101-5",
  numeroIsss: "123456789",
  nup: "123456789012",
  puesto: "Auxiliar contable",
  area: "Administración",
  salario: "800.00",
  fechaIngreso: "2026-01-15",
  activo: true,
};

const abrir = (permisos: CodigoPermiso[] = EDITAR) =>
  renderizar(<PantallaEmpleados parametros={{ empresaId: E }} />, { permisos });

async function llenarFormulario(dialogo: HTMLElement) {
  fireEvent.change(within(dialogo).getByLabelText("DUI"), { target: { value: empleado.dui } });
  fireEvent.change(within(dialogo).getByLabelText("Nombres"), { target: { value: empleado.nombres } });
  fireEvent.change(within(dialogo).getByLabelText("Apellidos"), { target: { value: empleado.apellidos } });
  fireEvent.change(within(dialogo).getByLabelText("NIT"), { target: { value: empleado.nit } });
  fireEvent.change(within(dialogo).getByLabelText("Número de ISSS"), {
    target: { value: empleado.numeroIsss },
  });
  fireEvent.change(within(dialogo).getByLabelText("NUP de AFP"), { target: { value: empleado.nup } });
  fireEvent.change(within(dialogo).getByLabelText("Puesto o cargo"), {
    target: { value: empleado.puesto },
  });
  fireEvent.change(within(dialogo).getByLabelText("Área"), { target: { value: empleado.area } });
  fireEvent.change(within(dialogo).getByLabelText("Salario mensual"), {
    target: { value: empleado.salario },
  });
  fireEvent.change(within(dialogo).getByLabelText("Fecha de ingreso"), {
    target: { value: empleado.fechaIngreso },
  });
  await screen.findByRole("option", { name: "Casa matriz" });
  fireEvent.change(within(dialogo).getByLabelText("Sucursal"), { target: { value: S } });
}

describe("pantalla de empleados (HU-70, S3-T95)", () => {
  it("muestra los datos laborales, salario y estado", async () => {
    simularApi({
      [EMPLEADOS]: { cuerpo: [empleado] },
      [SUCURSALES]: { cuerpo: [sucursal] },
    });
    abrir(VER);

    const fila = (await screen.findByText("01234567-8")).closest("tr")!;
    expect(within(fila).getByText("María García López")).toBeInTheDocument();
    expect(within(fila).getByText("0614-010190-101-5")).toBeInTheDocument();
    expect(within(fila).getByText("123456789")).toBeInTheDocument();
    expect(within(fila).getByText("123456789012")).toBeInTheDocument();
    expect(within(fila).getByText("Auxiliar contable")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 800.00")).toBeInTheDocument();
    expect(within(fila).getByText("Casa matriz")).toBeInTheDocument();
    expect(within(fila).getByText("Activo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo empleado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar empleado/ })).not.toBeInTheDocument();
  });

  it("muestra estado vacío y permite reintentar una lista fallida", async () => {
    simularApi({
      [EMPLEADOS]: { cuerpo: [] },
      [SUCURSALES]: { cuerpo: [sucursal] },
    });
    abrir();
    expect(await screen.findByText("Todavía no hay empleados registrados.")).toBeInTheDocument();

    let llamadas = 0;
    simularApi({
      [EMPLEADOS]: () => {
        llamadas += 1;
        return llamadas === 1
          ? { estado: 500, cuerpo: { message: "Error de prueba" } }
          : { cuerpo: [empleado] };
      },
      [SUCURSALES]: { cuerpo: [sucursal] },
    });
    abrir();
    expect(await screen.findByText(/No se pudieron cargar los empleados/)).toBeInTheDocument();
    await screen.findByRole("button", { name: "Reintentar" });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("01234567-8")).toBeInTheDocument();
  });

  it("envía el cuerpo completo con los valores normalizados al crear", async () => {
    let lista: EmpleadoVista[] = [];
    const peticiones = simularApi({
      [EMPLEADOS]: () => ({ cuerpo: lista }),
      [SUCURSALES]: { cuerpo: [sucursal] },
      [`POST /empresas/${E}/empleados`]: ({ cuerpo }) => {
        const nuevo = { ...empleado, ...(cuerpo as Partial<EmpleadoVista>) };
        lista = [nuevo];
        return { estado: 201, cuerpo: nuevo };
      },
    });
    const { usuario } = abrir();
    await screen.findByText("Todavía no hay empleados registrados.");
    await usuario.click(screen.getByRole("button", { name: "Nuevo empleado" }));
    const dialogo = await screen.findByRole("dialog");
    await llenarFormulario(dialogo);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar empleado" }));

    expect(await screen.findByText("01234567-8")).toBeInTheDocument();
    const peticion = peticiones.find((p) => p.metodo === "POST")!;
    expect(peticion.cuerpo).toEqual({
      dui: "01234567-8",
      nombres: "María",
      apellidos: "García López",
      nit: "0614-010190-101-5",
      numeroIsss: "123456789",
      nup: "123456789012",
      puesto: "Auxiliar contable",
      area: "Administración",
      salario: "800.00",
      fechaIngreso: "2026-01-15",
      sucursalId: S,
    });
  });

  it("valida el formulario antes de llamar a la API", async () => {
    const peticiones = simularApi({
      [EMPLEADOS]: { cuerpo: [] },
      [SUCURSALES]: { cuerpo: [sucursal] },
    });
    const { usuario } = abrir();
    await screen.findByText("Todavía no hay empleados registrados.");
    await usuario.click(screen.getByRole("button", { name: "Nuevo empleado" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar empleado" }));

    expect(await within(dialogo).findAllByText("Este campo es obligatorio.")).toHaveLength(7);
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("muestra el rechazo de la API y envía un PATCH mínimo al inactivar", async () => {
    const peticiones = simularApi({
      [EMPLEADOS]: { cuerpo: [empleado] },
      [SUCURSALES]: { cuerpo: [sucursal] },
      [`POST /empresas/${E}/empleados`]: {
        estado: 409,
        cuerpo: { message: "Ya existe un empleado con ese DUI, NIT, número ISSS o NUP en esta empresa." },
      },
      [`PATCH /empresas/${E}/empleados/${empleado.id}`]: {
        cuerpo: { ...empleado, activo: false },
      },
    });
    const { usuario } = abrir();
    await screen.findByText("01234567-8");
    await usuario.click(screen.getByRole("button", { name: "Nuevo empleado" }));
    const dialogo = await screen.findByRole("dialog");
    await llenarFormulario(dialogo);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar empleado" }));
    expect(await within(dialogo).findByText(/Ya existe un empleado con ese DUI/)).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await usuario.click(screen.getByRole("button", { name: "Inactivar empleado 01234567-8" }));
    await waitFor(() => expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ activo: false });
  });
});
