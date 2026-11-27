import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { SucursalDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaTablero } from "./pantalla-tablero";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const EMPRESA = "empresa-1";
const RUTA_SUCURSALES = `GET /empresas/${EMPRESA}/sucursales`;
const RUTA_TABLERO = `GET /empresas/${EMPRESA}/tablero`;

const sucursal: SucursalDetalle = {
  id: "sucursal-1",
  empresaId: EMPRESA,
  nombre: "San Miguel Centro",
  codigoEstablecimiento: "E001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz: true,
  activa: true,
  creadoEn: "2026-01-01T00:00:00.000Z",
  actualizadoEn: "2026-01-01T00:00:00.000Z",
};

const tablero = {
  ventasNetas: "46051.20",
  utilidadBruta: "11939.20",
  utilidadEjercicio: "7594.99",
  efectivo: "22270.89",
  margenBruto: "25.93",
  margenNeto: "16.49",
  ventasSemanales: [
    { etiqueta: "1–7 oct.", comprobantesCreditoFiscal: "10000.00", consumidorFinal: "500.00" },
  ],
  etapasUtilidad: [
    { id: "ventas", concepto: "Ventas netas", monto: "46051.20", porcentajeVentas: "100.00" },
    { id: "costo-ventas", concepto: "Costo de ventas", monto: "-34112.00", porcentajeVentas: "74.07" },
    { id: "utilidad-bruta", concepto: "Utilidad bruta", monto: "11939.20", porcentajeVentas: "25.93" },
    {
      id: "gastos-operacion",
      concepto: "Gastos de operación",
      monto: "-4329.21",
      porcentajeVentas: "9.41",
    },
    {
      id: "costos-financieros",
      concepto: "Costos financieros",
      monto: "-15.00",
      porcentajeVentas: "0.03",
    },
    {
      id: "utilidad-ejercicio",
      concepto: "Utilidad del ejercicio",
      monto: "7594.99",
      porcentajeVentas: "16.49",
    },
  ],
  productosRentables: [{ id: "producto-1", nombre: "Galaxy S25", utilidadBruta: "1445.55" }],
  categorias: [
    { id: "categoria-1", nombre: "Teléfonos", ventasNetas: "40000.00", utilidadBruta: "10000.00" },
  ],
};

function simularSedesYTablero(tableroHandler: Parameters<typeof simularApi>[0][string]) {
  return simularApi({
    [RUTA_SUCURSALES]: { cuerpo: [sucursal] },
    [RUTA_TABLERO]: tableroHandler,
  });
}

describe("PantallaTablero", () => {
  it("no consulta ni muestra datos si falta analitica.ver", () => {
    const peticiones = simularApi({});

    renderizar(<PantallaTablero parametros={{ empresaId: EMPRESA }} />);

    expect(screen.getByText("Tu rol no permite consultar el tablero.")).toBeInTheDocument();
    expect(screen.queryByText("46051.20")).not.toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("muestra el estado de carga hasta que responden los indicadores", async () => {
    let resolver!: (valor: { cuerpo: typeof tablero }) => void;
    simularSedesYTablero(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    renderizar(<PantallaTablero parametros={{ empresaId: EMPRESA }} />, { permisos: ["analitica.ver"] });

    expect(await screen.findByRole("status")).toHaveTextContent("Cargando indicadores del tablero");
    resolver({ cuerpo: tablero });
    expect(await screen.findByText("Ventas por semana")).toBeInTheDocument();
  });

  it("permite reintentar después de un error de la API", async () => {
    let intentos = 0;
    simularSedesYTablero(() => {
      intentos += 1;
      return intentos === 1 ? { estado: 500, cuerpo: { message: "Error temporal" } } : { cuerpo: tablero };
    });
    const { usuario } = renderizar(<PantallaTablero parametros={{ empresaId: EMPRESA }} />, {
      permisos: ["analitica.ver"],
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Error temporal");
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Ventas por semana")).toBeInTheDocument();
    expect(intentos).toBe(2);
  });

  it("avisa de un mes inválido y no consulta los indicadores", async () => {
    const peticiones = simularSedesYTablero({ cuerpo: tablero });
    renderizar(<PantallaTablero parametros={{ empresaId: EMPRESA }} />, { permisos: ["analitica.ver"] });
    await screen.findByText("Ventas por semana");
    const solicitudesAntes = peticiones.filter((peticion) => peticion.ruta.endsWith("/tablero")).length;

    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "" } });

    expect(await screen.findByText("Selecciona un mes válido.")).toBeInTheDocument();
    expect(peticiones.filter((peticion) => peticion.ruta.endsWith("/tablero"))).toHaveLength(
      solicitudesAntes,
    );
  });

  it("envía exactamente el mes y la sucursal seleccionados", async () => {
    const peticiones = simularSedesYTablero({ cuerpo: tablero });
    const { usuario } = renderizar(<PantallaTablero parametros={{ empresaId: EMPRESA }} />, {
      permisos: ["analitica.ver"],
      todasSucursales: true,
    });

    await screen.findByText("Ventas por semana");
    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-10" } });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), "sucursal-1");

    await waitFor(() => {
      const solicitud = peticiones.find(
        (peticion) =>
          peticion.ruta.endsWith("/tablero") &&
          peticion.consulta.get("mes") === "2026-10" &&
          peticion.consulta.get("sucursalId") === "sucursal-1",
      );
      expect(solicitud?.consulta.get("sucursalId")).toBe("sucursal-1");
      expect([...solicitud!.consulta.keys()].sort()).toEqual(["mes", "sucursalId"]);
    });
  });

  it("presenta valores, ventas semanales, puente, productos y categorías de cada gráfica", async () => {
    simularSedesYTablero({ cuerpo: tablero });
    renderizar(<PantallaTablero parametros={{ empresaId: EMPRESA }} />, { permisos: ["analitica.ver"] });

    expect(await screen.findAllByText("46,051.20")).toHaveLength(2);
    expect(screen.getAllByText("11,939.20")).toHaveLength(2);
    expect(screen.getAllByText("7,594.99")).toHaveLength(2);
    expect(screen.getByText("22,270.89")).toBeInTheDocument();
    expect(screen.getByText("Galaxy S25")).toBeInTheDocument();
    expect(screen.getByText("Costo de ventas")).toBeInTheDocument();
    expect(screen.getByText("Costos financieros")).toBeInTheDocument();

    const graficaSemanal = screen.getByRole("img", { name: "Ventas por semana" });
    expect(within(graficaSemanal).getByText("1–7 oct.")).toBeInTheDocument();
    expect([...graficaSemanal.querySelectorAll("title")].map((titulo) => titulo.textContent)).toEqual([
      "Contribuyentes (CCF): 10,000.00",
      "Consumidor final: 500.00",
    ]);
    const graficaCategorias = screen.getByRole("img", { name: "Ventas por categoría" });
    expect([...graficaCategorias.querySelectorAll("title")].map((titulo) => titulo.textContent)).toEqual([
      "Ventas netas: 40,000.00",
      "Utilidad bruta: 10,000.00",
      "Teléfonos",
    ]);
  });
});
