import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { BalanceGeneral, SeccionEstado } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaBalanceGeneral } from "./pantalla-balance-general";

const E = "e1";
const S1 = "20000000-0000-4000-8000-000000000001";
const BALANCE = `GET /empresas/${E}/estados/balance-general`;
const VER: CodigoPermiso[] = ["estados.ver"];
const BASE = {
  [`GET /empresas/${E}/sucursales`]: {
    cuerpo: [
      {
        id: S1,
        empresaId: E,
        nombre: "Casa matriz",
        codigoEstablecimiento: "M001",
        codigoPuntoVenta: "0001",
        direccion: null,
        esMatriz: true,
        activa: true,
        creadoEn: "2026-11-01T00:00:00.000Z",
        actualizadoEn: "2026-11-01T00:00:00.000Z",
      },
    ],
  },
  [`GET /empresas/${E}`]: { cuerpo: { id: E, nombre: "CheroPhonex, S.A. de C.V.", nombreComercial: null } },
};

const seccion = (titulo: string, renglones: SeccionEstado["renglones"], total: string): SeccionEstado => ({
  titulo,
  renglones,
  total,
});

const balance = (extra: Partial<BalanceGeneral> = {}): BalanceGeneral => ({
  fecha: "2026-11-20",
  sucursalId: null,
  activoCorriente: seccion(
    "Activo corriente",
    [
      { codigo: "1101", nombre: "Efectivo y equivalentes", monto: "5000.00" },
      { codigo: "1103", nombre: "Cuentas por cobrar", monto: "1500.00" },
    ],
    "6500.00",
  ),
  activoNoCorriente: seccion(
    "Activo no corriente",
    [
      { codigo: "1201", nombre: "Propiedad, planta y equipo", monto: "4000.00" },
      { codigo: "1202", nombre: "Depreciación acumulada", monto: "-500.00" },
    ],
    "3500.00",
  ),
  totalActivo: "10000.00",
  pasivoCorriente: seccion(
    "Pasivo corriente",
    [{ codigo: "2101", nombre: "Proveedores", monto: "2000.00" }],
    "2000.00",
  ),
  pasivoNoCorriente: seccion("Pasivo no corriente", [], "0.00"),
  totalPasivo: "2000.00",
  patrimonio: seccion(
    "Patrimonio",
    [
      { codigo: "3101", nombre: "Capital social", monto: "7000.00" },
      { codigo: "", nombre: "Utilidad del ejercicio", monto: "1000.00" },
    ],
    "8000.00",
  ),
  totalPasivoPatrimonio: "10000.00",
  diferencia: "0.00",
  cuadra: true,
  ...extra,
});

const abrir = (permisos: CodigoPermiso[] = VER) =>
  renderizar(<PantallaBalanceGeneral parametros={{ empresaId: E }} />, { permisos });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 20, 9, 0));
});
afterEach(() => vi.useRealTimers());

describe("pantalla del balance general (S2-T47)", () => {
  it("consulta a la fecha de hoy y muestra activo frente a pasivo y patrimonio", async () => {
    const peticiones = simularApi({ ...BASE, [BALANCE]: { cuerpo: balance() } });
    abrir();

    const activo = await screen.findByRole("region", { name: "Activo" });
    expect(Object.fromEntries(peticiones.find((p) => p.ruta.endsWith("/balance-general"))!.consulta)).toEqual(
      {
        fecha: "2026-11-20",
      },
    );

    const corriente = within(activo).getByRole("group", { name: "Activo corriente" });
    expect(corriente).toHaveTextContent("1101Efectivo y equivalentes5,000.00");
    expect(within(activo).getByRole("group", { name: "Activo no corriente" })).toHaveTextContent(
      "Depreciación acumulada(500.00)",
    );
    expect(activo).toHaveTextContent("Total activoUS$ 10,000.00");

    const pasivo = screen.getByRole("region", { name: "Pasivo y patrimonio" });
    expect(within(pasivo).getByRole("group", { name: "Pasivo no corriente" })).toHaveTextContent(
      "Sin saldos",
    );
    expect(within(pasivo).getByRole("group", { name: "Patrimonio" })).toHaveTextContent(
      "CalculadoUtilidad del ejercicio1,000.00",
    );
    expect(pasivo).toHaveTextContent("Total pasivo2,000.00");
    expect(pasivo).toHaveTextContent("Total pasivo más patrimonioUS$ 10,000.00");
    expect(screen.getByRole("status")).toHaveTextContent("Activo y pasivo más patrimonio cuadran");
    expect(screen.getByText("Al 20/11/2026 · Consolidado")).toBeInTheDocument();
  });

  it("exporta el balance con firmas y las del documento salen de la empresa (HU-39)", async () => {
    simularApi({
      ...BASE,
      [`GET /empresas/${E}`]: {
        cuerpo: {
          id: E,
          nombre: "CheroPhonex, S.A. de C.V.",
          nombreComercial: null,
          nit: "0614-010190-101-5",
          logoUrl: null,
          representanteLegal: "Carlos Hernández",
          contadorNombre: "María Rivas",
          contadorRegistro: null,
        },
      },
      [BALANCE]: { cuerpo: balance() },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Exportar con firmas" }));
    const dialogo = screen.getByRole("dialog", { name: "Exportar balance general" });
    expect(within(dialogo).getByRole("textbox", { name: "Contador" })).toHaveValue("María Rivas");
    expect(within(dialogo).getByText(/Al 20\/11\/2026 · Consolidado/)).toBeInTheDocument();
  });

  it("indica la diferencia cuando no cuadra", async () => {
    simularApi({
      ...BASE,
      [BALANCE]: {
        cuerpo: balance({ totalPasivoPatrimonio: "9975.00", diferencia: "25.00", cuadra: false }),
      },
    });
    abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No cuadra. Activo y pasivo más patrimonio difieren en US$ 25.00.",
    );
  });

  it("consulta por fecha y por sucursal", async () => {
    const peticiones = simularApi({ ...BASE, [BALANCE]: { cuerpo: balance() } });
    const { usuario } = abrir();
    await screen.findByRole("region", { name: "Activo" });

    const fecha = screen.getByLabelText("Al");
    await usuario.clear(fecha);
    await usuario.type(fecha, "2026-10-31");
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), "Casa matriz");

    await waitFor(() => {
      const ultima = peticiones.filter((p) => p.ruta.endsWith("/balance-general")).at(-1)!;
      expect(Object.fromEntries(ultima.consulta)).toEqual({ fecha: "2026-10-31", sucursalId: S1 });
    });
  });

  it("sin fecha no consulta y lo indica", async () => {
    const peticiones = simularApi({ ...BASE, [BALANCE]: { cuerpo: balance() } });
    const { usuario } = abrir();
    await screen.findByRole("region", { name: "Activo" });
    const antes = peticiones.filter((p) => p.ruta.endsWith("/balance-general")).length;

    await usuario.clear(screen.getByLabelText("Al"));
    expect(screen.getByText("Escribe la fecha del balance.")).toBeInTheDocument();
    expect(peticiones.filter((p) => p.ruta.endsWith("/balance-general"))).toHaveLength(antes);
  });

  it("sin estados.ver no consulta", () => {
    const peticiones = simularApi({});
    abrir(["reportes.ver"]);
    expect(screen.getByText("Tu rol no permite consultar este reporte.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });
});
