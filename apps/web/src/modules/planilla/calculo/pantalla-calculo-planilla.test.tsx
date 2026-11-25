import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaCalculoPlanilla } from "./pantalla-calculo-planilla";

const E = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const CUENTA = "33333333-3333-4333-8333-333333333333";
const EMPLEADO = "44444444-4444-4444-8444-444444444444";
const PERMISOS: CodigoPermiso[] = ["planilla.calcular", "planilla.ver", "catalogo.ver", "sucursales.ver"];
const RUTA_EMPLEADOS = "/empresas/" + E + "/empleados";
const RUTA_SUCURSALES = "/empresas/" + E + "/sucursales";
const RUTA_CUENTAS = "/empresas/" + E + "/cuentas";
const RUTA_CALCULO = "/empresas/" + E + "/planillas/calcular";
const listaEmpleados = [
  {
    id: EMPLEADO,
    sucursalId: S,
    sucursal: "Casa matriz",
    nombres: "Persona",
    apellidos: "Prueba",
    dui: "DUI-SINTETICO-01",
    nit: "NIT-SINTETICO-01",
    numeroIsss: "ISSS-SINTETICO-01",
    nup: "NUP-SINTETICO-01",
    puesto: "Auxiliar contable",
    area: "Administración",
    salario: "1875.61",
    fechaIngreso: "2026-01-15",
    activo: true,
  },
];
const sucursales = [{ id: S, nombre: "Casa matriz", codigoEstablecimiento: "M001", activa: true }];
const cuentas = [
  {
    id: CUENTA,
    codigo: "4201",
    nombre: "Gastos de administración",
    nivel: 4,
    naturaleza: "deudora",
    tipo: "costos_gastos",
    cuentaPadreId: null,
    activa: true,
  },
];
const resultado = {
  periodo: "2026-11",
  sucursalId: S,
  empleados: [
    {
      empleadoId: EMPLEADO,
      nombres: "Persona",
      apellidos: "Prueba",
      numeroIsss: "ISSS-SINTETICO-01",
      nup: "NUP-SINTETICO-01",
      dui: "DUI-SINTETICO-01",
      puesto: "Auxiliar contable",
      area: "Administración",
      salarioBase: "1875.61",
      horasExtra: "2.50",
      pagoHorasExtra: "39.08",
      diasAusencia: "0.00",
      descuentoAusencia: "0.00",
      otrosDescuentos: "0.00",
      bruto: "1914.69",
      isssLaboral: "30.00",
      afpLaboral: "138.82",
      renta: "263.89",
      isssPatronal: "75.00",
      afpPatronal: "167.54",
      neto: "1481.98",
    },
  ],
  resumen: {
    bruto: "1914.69",
    isssLaboral: "30.00",
    afpLaboral: "138.82",
    renta: "263.89",
    otrosDescuentos: "0.00",
    neto: "1481.98",
    isssPatronal: "75.00",
    afpPatronal: "167.54",
    gastoPatronal: "242.54",
  },
  partida: { id: "55555555-5555-4555-8555-555555555555" },
};

function datosBase() {
  return {
    ["GET " + RUTA_EMPLEADOS]: { cuerpo: listaEmpleados },
    ["GET " + RUTA_SUCURSALES]: { cuerpo: sucursales },
    ["GET " + RUTA_CUENTAS]: { cuerpo: cuentas },
  };
}

const abrir = (permisos: CodigoPermiso[] = PERMISOS) =>
  renderizar(<PantallaCalculoPlanilla parametros={{ empresaId: E }} />, { permisos });

describe("pantalla de cálculo de planilla (HU-72, S3-T101)", () => {
  it("carga sucursales, empleados y cuentas, y envía ajustes completos al generar la partida", async () => {
    const peticiones = simularApi({
      ...datosBase(),
      ["POST " + RUTA_CALCULO]: { cuerpo: resultado },
    });
    const { usuario } = abrir();
    await screen.findByRole("option", { name: "Casa matriz" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S);
    expect(await screen.findByText("Auxiliar contable")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Período"), { target: { value: "2026-11" } });
    fireEvent.change(screen.getByLabelText("Horas extra de DUI-SINTETICO-01"), {
      target: { value: "2.50" },
    });
    await usuario.click(screen.getByRole("button", { name: "Calcular y generar partida" }));

    expect(await screen.findByText("Partida generada en borrador")).toBeInTheDocument();
    expect(screen.getAllByText("US$ 1,481.98")).toHaveLength(2);
    expect(screen.getByText("US$ 242.54")).toBeInTheDocument();
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      periodo: "2026-11",
      sucursalId: S,
      cuentasGastoPorArea: [],
      ajustes: [
        {
          empleadoId: EMPLEADO,
          horasExtra: "2.50",
          diasAusencia: "0.00",
          otrosDescuentos: "0.00",
        },
      ],
    });
  });

  it("pide y envía una cuenta para un área distinta de Administración y Ventas", async () => {
    const peticiones = simularApi({
      ...datosBase(),
      ["GET " + RUTA_EMPLEADOS]: { cuerpo: [{ ...listaEmpleados[0], area: "Operaciones" }] },
      ["POST " + RUTA_CALCULO]: { cuerpo: resultado },
    });
    const { usuario } = abrir();
    await screen.findByRole("option", { name: "Casa matriz" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S);
    fireEvent.change(screen.getByLabelText("Período"), { target: { value: "2026-11" } });
    await usuario.click(screen.getByRole("tab", { name: "Distribución del gasto" }));
    await usuario.selectOptions(await screen.findByLabelText("Cuenta para Operaciones"), CUENTA);
    await usuario.click(screen.getByRole("button", { name: "Calcular y generar partida" }));

    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      periodo: "2026-11",
      sucursalId: S,
      cuentasGastoPorArea: [{ clave: "operaciones", cuentaGastoId: CUENTA }],
      ajustes: [],
    });
  });

  it("muestra la lista vacía y no consulta si falta permiso", async () => {
    simularApi({ ...datosBase(), ["GET " + RUTA_EMPLEADOS]: { cuerpo: [] } });
    const { usuario } = abrir();
    await screen.findByRole("option", { name: "Casa matriz" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S);
    expect(
      await screen.findByText("No hay empleados activos para calcular en esta sucursal."),
    ).toBeInTheDocument();

    const peticiones = simularApi({});
    abrir([]);
    expect(
      await screen.findByText("No tienes permiso para calcular planillas en esta empresa."),
    ).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("reintenta la carga de sucursales y presenta el rechazo del cálculo", async () => {
    let llamadasSucursal = 0;
    const peticiones = simularApi({
      ...datosBase(),
      ["GET " + RUTA_SUCURSALES]: () => {
        llamadasSucursal += 1;
        return llamadasSucursal === 1
          ? { estado: 500, cuerpo: { message: "Falla temporal" } }
          : { cuerpo: sucursales };
      },
      ["POST " + RUTA_CALCULO]: { estado: 422, cuerpo: { message: "Revise los ajustes ingresados." } },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Reintentar" }));
    await screen.findByRole("option", { name: "Casa matriz" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S);
    await usuario.click(screen.getByRole("button", { name: "Calcular y generar partida" }));
    expect(await screen.findByText(/Revise los ajustes ingresados/)).toBeInTheDocument();
    expect(peticiones.some((peticion) => peticion.metodo === "POST")).toBe(true);
  });

  it("imprime una boleta individual y el lote desde el resultado exacto de planilla", async () => {
    const documentos: string[] = [];
    const documento = {
      open: vi.fn(),
      write: vi.fn((html: string) => documentos.push(html)),
      close: vi.fn(),
    };
    const ventana = {
      opener: window,
      document: documento,
      addEventListener: vi.fn(),
      setTimeout: vi.fn(),
      focus: vi.fn(),
      print: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(ventana as unknown as WindowProxy);
    simularApi({ ...datosBase(), ["POST " + RUTA_CALCULO]: { cuerpo: resultado } });
    const { usuario } = abrir();
    await screen.findByRole("option", { name: "Casa matriz" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S);
    await usuario.click(screen.getByRole("button", { name: "Calcular y generar partida" }));
    await screen.findByText("Partida generada en borrador");

    await usuario.click(screen.getByRole("button", { name: "Imprimir boleta DUI-SINTETICO-01" }));
    expect(documentos[0]).toContain("DUI: DUI-SINTETICO-01");
    expect(documentos[0]).toContain("Persona Prueba");
    expect(documentos[0]).toContain("US$ 1,481.98");
    await usuario.click(screen.getByRole("button", { name: "Imprimir boletas en lote" }));
    expect(documentos).toHaveLength(2);
    expect(documentos[1]).toContain("Boleta de pago");
    expect(documentos[1]).toContain("Persona Prueba");
    expect(window.open).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});
