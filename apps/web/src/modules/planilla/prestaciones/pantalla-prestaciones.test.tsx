import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaPrestaciones } from "./pantalla-prestaciones";

const E = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const CUENTA = "33333333-3333-4333-8333-333333333333";
const EMPLEADO = "44444444-4444-4444-8444-444444444444";
const PERMISOS: CodigoPermiso[] = ["planilla.calcular", "planilla.ver", "catalogo.ver", "sucursales.ver"];
const RUTA_EMPLEADOS = `/empresas/${E}/empleados`;
const RUTA_SUCURSALES = `/empresas/${E}/sucursales`;
const RUTA_CUENTAS = `/empresas/${E}/cuentas`;
const RUTA_PRESTACIONES = `/empresas/${E}/prestaciones/calcular`;

const empleados = [
  {
    id: EMPLEADO,
    sucursalId: S,
    sucursal: "Casa matriz",
    dui: "DUI-SINTETICO-01",
    nit: "NIT-SINTETICO-01",
    numeroIsss: "ISSS-SINTETICO-01",
    nup: "NUP-SINTETICO-01",
    puesto: "Auxiliar contable",
    area: "Administración",
    salario: "600.00",
    fechaIngreso: "2025-12-12",
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
  fechaCalculo: "2026-12-12",
  periodo: "2026-12",
  sucursalId: S,
  empleados: [
    {
      empleadoId: EMPLEADO,
      dui: "DUI-SINTETICO-01",
      puesto: "Auxiliar contable",
      area: "Administración",
      fechaIngreso: "2025-12-12",
      salarioBase: "600.00",
      diasServicio: 365,
      aniosServicio: "1.0000",
      fechaCorteAguinaldo: "2026-12-12",
      diasAguinaldo: "15.00",
      montoAguinaldo: "300.00",
      provisionAguinaldoMensual: "25.00",
      diasPeriodoVacacional: 365,
      montoVacaciones: "390.00",
      provisionVacacionesMensual: "32.50",
      salarioBaseIndemnizacion: "600.00",
      montoIndemnizacion: "600.00",
      provisionIndemnizacionMensual: "50.00",
    },
  ],
  resumen: {
    montoAguinaldo: "300.00",
    provisionAguinaldoMensual: "25.00",
    montoVacaciones: "390.00",
    provisionVacacionesMensual: "32.50",
    montoIndemnizacion: "600.00",
    provisionIndemnizacionMensual: "50.00",
    provisionMensualTotal: "107.50",
  },
  partida: {
    id: "55555555-5555-4555-8555-555555555555",
    fecha: "2026-12-31",
    estado: "borrador",
    origen: "prestaciones",
    concepto: "Provisión de prestaciones del período 2026-12",
    totalDebe: "107.50",
    totalHaber: "107.50",
    cuadra: true,
  },
};

function datosBase() {
  return {
    ["GET " + RUTA_EMPLEADOS]: { cuerpo: empleados },
    ["GET " + RUTA_SUCURSALES]: { cuerpo: sucursales },
    ["GET " + RUTA_CUENTAS]: { cuerpo: cuentas },
  };
}

const abrir = (permisos: CodigoPermiso[] = PERMISOS) =>
  renderizar(<PantallaPrestaciones parametros={{ empresaId: E }} />, { permisos });

describe("pantalla de prestaciones (HU-74, S3-T107)", () => {
  it("calcula las prestaciones y envía exactamente la fecha, sucursal y áreas sin clasificación", async () => {
    const peticiones = simularApi({
      ...datosBase(),
      ["POST " + RUTA_PRESTACIONES]: { cuerpo: resultado },
    });
    const { usuario } = abrir();
    await screen.findByRole("option", { name: "Casa matriz" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S);
    fireEvent.change(screen.getByLabelText("Fecha de cálculo"), { target: { value: "2026-12-12" } });
    await usuario.click(screen.getByRole("button", { name: "Calcular y generar provisión" }));

    expect(await screen.findByText("Partida de provisión en borrador")).toBeInTheDocument();
    expect(screen.getByText("1.0000")).toBeInTheDocument();
    expect(screen.getByText("US$ 107.50")).toBeInTheDocument();
    expect(screen.getAllByText("US$ 390.00")).toHaveLength(2);
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      fechaCalculo: "2026-12-12",
      sucursalId: S,
      cuentasGastoPorArea: [],
    });
  });

  it("exige elegir una cuenta para las áreas sin clasificación automática", async () => {
    const peticiones = simularApi({
      ...datosBase(),
      ["GET " + RUTA_EMPLEADOS]: {
        cuerpo: [{ ...empleados[0], area: "Operaciones" }],
      },
      ["POST " + RUTA_PRESTACIONES]: { cuerpo: resultado },
    });
    const { usuario } = abrir();
    await screen.findByRole("option", { name: "Casa matriz" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S);
    await usuario.selectOptions(await screen.findByLabelText("Cuenta para Operaciones"), CUENTA);
    fireEvent.change(screen.getByLabelText("Fecha de cálculo"), { target: { value: "2026-12-12" } });
    await usuario.click(screen.getByRole("button", { name: "Calcular y generar provisión" }));

    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      fechaCalculo: "2026-12-12",
      sucursalId: S,
      cuentasGastoPorArea: [{ clave: "operaciones", cuentaGastoId: CUENTA }],
    });
  });

  it("muestra el estado vacío, no calcula sin empleados y oculta la pantalla sin permiso", async () => {
    simularApi({ ...datosBase(), ["GET " + RUTA_EMPLEADOS]: { cuerpo: [] } });
    const { usuario } = abrir();
    await screen.findByRole("option", { name: "Casa matriz" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S);
    expect(
      await screen.findByText("No hay empleados activos para esta sucursal y fecha."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calcular y generar provisión" })).toBeDisabled();

    const peticiones = simularApi({});
    abrir([]);
    expect(
      await screen.findByText("No tienes permiso para calcular prestaciones en esta empresa."),
    ).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("reintenta la carga y presenta los errores del cálculo", async () => {
    let llamadasSucursal = 0;
    const peticiones = simularApi({
      ...datosBase(),
      ["GET " + RUTA_SUCURSALES]: () => {
        llamadasSucursal += 1;
        return llamadasSucursal === 1
          ? { estado: 500, cuerpo: { message: "Falla temporal" } }
          : { cuerpo: sucursales };
      },
      ["POST " + RUTA_PRESTACIONES]: { estado: 422, cuerpo: { message: "No hay importes de provisión." } },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Reintentar" }));
    await screen.findByRole("option", { name: "Casa matriz" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S);
    await usuario.click(screen.getByRole("button", { name: "Calcular y generar provisión" }));
    expect(await screen.findByText(/No hay importes de provisión/)).toBeInTheDocument();
    expect(peticiones.some((peticion) => peticion.metodo === "POST")).toBe(true);
  });
});
