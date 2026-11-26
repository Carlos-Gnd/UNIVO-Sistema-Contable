import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { SucursalDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaRazones } from "./pantalla-razones";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sucursales: SucursalDetalle[] = [
  {
    id: "sucursal-1",
    empresaId: "empresa-1",
    nombre: "San Miguel Centro",
    codigoEstablecimiento: "E001",
    codigoPuntoVenta: "P001",
    direccion: null,
    esMatriz: true,
    activa: true,
    creadoEn: "2026-01-01T00:00:00.000Z",
    actualizadoEn: "2026-01-01T00:00:00.000Z",
  },
];

const razones = {
  desde: "2026-10-01",
  hasta: "2026-10-31",
  sucursalId: null,
  liquidezCorriente: "12.77",
  pruebaAcida: "10.22",
  endeudamiento: "7.25",
  margenBruto: "25.93",
  margenOperativo: "19.00",
  margenNeto: "16.49",
  rentabilidadActivo: "23.76",
  rentabilidadPatrimonio: "25.62",
};

const balance = {
  fecha: "2026-10-31",
  sucursalId: null,
  activoCorriente: {
    titulo: "Activo corriente",
    total: "30000.00",
    renglones: [{ codigo: "1109", nombre: "Inventarios", monto: "2000.00" }],
  },
  activoNoCorriente: { titulo: "Activo no corriente", total: "0.00", renglones: [] },
  totalActivo: "30000.00",
  pasivoCorriente: { titulo: "Pasivo corriente", total: "2750.84", renglones: [] },
  pasivoNoCorriente: { titulo: "Pasivo no corriente", total: "0.00", renglones: [] },
  totalPasivo: "2175.00",
  patrimonio: { titulo: "Patrimonio", total: "27825.00", renglones: [] },
  totalPasivoPatrimonio: "30000.00",
  diferencia: "0.00",
  cuadra: true,
};

const balanceInicial = {
  ...balance,
  fecha: "2026-10-31",
  activoCorriente: {
    ...balance.activoCorriente,
    renglones: [{ codigo: "1109", nombre: "Inventarios", monto: "1000.00" }],
  },
};

const estadoResultados = {
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  ventas: { titulo: "Ventas", renglones: [], total: "46051.20" },
  costoVentas: { titulo: "Costo de ventas", renglones: [], total: "15000.00" },
  utilidadBruta: "11939.20",
  gastosOperacion: { titulo: "Gastos de operación", renglones: [], total: "4344.21" },
  utilidadOperacion: "7594.99",
  otrosIngresos: { titulo: "Otros ingresos", renglones: [], total: "0.00" },
  otrosGastos: { titulo: "Otros gastos", renglones: [], total: "0.00" },
  utilidadAntesImpuesto: "7594.99",
  impuestoRenta: { titulo: "Impuesto", renglones: [], total: "0.00" },
  utilidadNeta: "7594.99",
};

describe("PantallaRazones", () => {
  it("consulta el período y muestra las razones con fórmulas e interpretación", async () => {
    const peticiones = simularApi({
      "GET /empresas/empresa-1/sucursales": { cuerpo: sucursales },
      "GET /empresas/empresa-1/estados/razones-financieras": ({ consulta }) => {
        expect(consulta.get("desde")).toMatch(/^\d{4}-\d{2}-01$/);
        expect(consulta.get("hasta")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        return { cuerpo: razones };
      },
      "GET /empresas/empresa-1/estados/balance-general": ({ consulta }) => ({
        cuerpo: consulta.get("fecha") === "2026-10-31" ? balanceInicial : balance,
      }),
      "GET /empresas/empresa-1/estados/resultados": { cuerpo: estadoResultados },
    });

    renderizar(<PantallaRazones parametros={{ empresaId: "empresa-1" }} />, { permisos: ["estados.ver"] });

    expect(await screen.findByText("Liquidez corriente")).toBeInTheDocument();
    expect(screen.getByText("12.77 veces")).toBeInTheDocument();
    expect(
      screen.getByText("Por cada dólar que debe a corto plazo, tiene este monto en activos corrientes."),
    ).toBeInTheDocument();
    expect(screen.getByText("Rendimiento del patrimonio (ROE)")).toBeInTheDocument();
    await waitFor(() => expect(peticiones).toHaveLength(5));
    const peticionRazones = peticiones.find((peticion) => peticion.ruta.endsWith("/razones-financieras"));
    expect(peticionRazones?.consulta.get("desde")).toBeTruthy();
    expect(peticionRazones?.consulta.get("hasta")).toBeTruthy();
    expect(screen.getByText("US$ 27,249.16")).toBeInTheDocument();
    expect(screen.getByText("10.00 veces")).toBeInTheDocument();
    expect(screen.getByText("3.00 días")).toBeInTheDocument();
    expect(screen.getByText("0.08 veces")).toBeInTheDocument();
  });

  it("informa los permisos requeridos sin consultar datos cuando no tiene acceso", () => {
    const peticiones = simularApi({});
    renderizar(<PantallaRazones parametros={{ empresaId: "empresa-1" }} />);

    expect(screen.getByText("Tu rol no permite consultar razones financieras.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("no inventa un valor cuando un denominador produjo null", async () => {
    simularApi({
      "GET /empresas/empresa-1/sucursales": { cuerpo: sucursales },
      "GET /empresas/empresa-1/estados/razones-financieras": {
        cuerpo: { ...razones, liquidezCorriente: null, pruebaAcida: null },
      },
      "GET /empresas/empresa-1/estados/balance-general": { cuerpo: balance },
      "GET /empresas/empresa-1/estados/resultados": { cuerpo: estadoResultados },
    });
    renderizar(<PantallaRazones parametros={{ empresaId: "empresa-1" }} />, { permisos: ["estados.ver"] });

    expect(await screen.findAllByText("No disponible")).toHaveLength(2);
  });
});
