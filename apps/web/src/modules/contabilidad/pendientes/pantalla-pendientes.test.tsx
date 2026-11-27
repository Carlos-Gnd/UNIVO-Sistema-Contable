import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { PartidaVista, SucursalDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaPendientes } from "./pantalla-pendientes";

const E = "e1";
const CONTADOR: CodigoPermiso[] = ["partidas.ver", "partidas.registrar", "partidas.contabilizar"];
const AUXILIAR: CodigoPermiso[] = ["partidas.ver", "partidas.registrar"];
const BORRADORES = `GET /empresas/${E}/partidas/borradores`;
const SUCURSALES = `GET /empresas/${E}/sucursales`;
const MATRIZ_ID = "20000000-0000-4000-8000-000000000001";
const USULUTAN_ID = "20000000-0000-4000-8000-000000000002";

const sucursal = (id: string, nombre: string): SucursalDetalle => ({
  id,
  empresaId: E,
  nombre,
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz: false,
  activa: true,
  creadoEn: "2026-11-10T00:00:00.000Z",
  actualizadoEn: "2026-11-10T00:00:00.000Z",
});

const borrador = (id: string, concepto: string, extra: Partial<PartidaVista> = {}): PartidaVista => ({
  id,
  sucursalId: MATRIZ_ID,
  fecha: "2026-11-09",
  tipo: "operacion",
  estado: "borrador",
  numero: null,
  concepto,
  documentoTipo: null,
  documentoNumero: null,
  origen: "manual",
  lineas: [],
  explicacionDidactica: null,
  totalDebe: "100.00",
  totalHaber: "100.00",
  diferencia: "0.00",
  cuadra: true,
  creadoEn: "2026-11-09T10:00:00.000Z",
  actualizadoEn: "2026-11-09T10:00:00.000Z",
  ...extra,
});

const LUZ = borrador("p1", "Pago de energía eléctrica", { totalDebe: "85.40", totalHaber: "85.40" });
const VENTA = borrador("p2", "Venta de contado", {
  fecha: "2026-11-08",
  sucursalId: USULUTAN_ID,
  totalDebe: "500.00",
  totalHaber: "450.00",
  diferencia: "50.00",
  cuadra: false,
});
const ALQUILER = borrador("p3", "Alquiler de local", { fecha: "2026-11-05", sucursalId: USULUTAN_ID });

const SUCURSALES_RESP = { cuerpo: [sucursal(MATRIZ_ID, "Casa matriz"), sucursal(USULUTAN_ID, "Usulután")] };

const abrir = (permisos: CodigoPermiso[] = CONTADOR) =>
  renderizar(<PantallaPendientes parametros={{ empresaId: E }} />, { permisos });

const conceptos = async () =>
  within(await screen.findByRole("table", { name: "Bandeja de pendientes" }))
    .getAllByRole("link")
    .map((enlace) => enlace.textContent);

describe("bandeja de pendientes (S1-T83)", () => {
  it("lista los borradores con su sucursal y la diferencia de los descuadrados", async () => {
    simularApi({ [BORRADORES]: { cuerpo: [LUZ, VENTA] }, [SUCURSALES]: SUCURSALES_RESP });
    abrir();

    expect(await conceptos()).toEqual(["Pago de energía eléctrica", "Venta de contado"]);
    const venta = screen.getByRole("link", { name: "Abrir Venta de contado" }).closest("tr")!;
    expect(venta).toHaveTextContent("Usulután");
    expect(venta).toHaveTextContent("Diferencia US$ 50.00");
    const luz = screen.getByRole("link", { name: "Abrir Pago de energía eléctrica" }).closest("tr")!;
    expect(luz).toHaveTextContent("Cuadra");
    expect(screen.getByText("2 borradores · 1 descuadrados")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir Venta de contado" })).toHaveAttribute(
      "href",
      `/empresas/${E}/partidas/p2`,
    );
  });

  it("filtra por sucursal", async () => {
    simularApi({ [BORRADORES]: { cuerpo: [LUZ, VENTA, ALQUILER] }, [SUCURSALES]: SUCURSALES_RESP });
    const { usuario } = abrir();

    await conceptos();
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), "Usulután");
    expect(await conceptos()).toEqual(["Venta de contado", "Alquiler de local"]);
  });

  it("muestra el mensaje de bandeja vacía", async () => {
    simularApi({ [BORRADORES]: { cuerpo: [] }, [SUCURSALES]: SUCURSALES_RESP });
    abrir();
    expect(await screen.findByText("No hay partidas pendientes.")).toBeInTheDocument();
  });

  it("el auxiliar ve la bandeja pero no puede seleccionar para contabilizar", async () => {
    simularApi({ [BORRADORES]: { cuerpo: [LUZ] }, [SUCURSALES]: SUCURSALES_RESP });
    abrir(AUXILIAR);

    await conceptos();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("solo deja seleccionar las partidas que cuadran", async () => {
    simularApi({ [BORRADORES]: { cuerpo: [LUZ, VENTA, ALQUILER] }, [SUCURSALES]: SUCURSALES_RESP });
    const { usuario } = abrir();

    await conceptos();
    expect(screen.getByRole("checkbox", { name: "Seleccionar Venta de contado" })).toBeDisabled();
    await usuario.click(screen.getByRole("checkbox", { name: "Seleccionar todas las partidas que cuadran" }));
    expect(screen.getByRole("checkbox", { name: "Seleccionar Pago de energía eléctrica" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Seleccionar Alquiler de local" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Seleccionar Venta de contado" })).not.toBeChecked();
    expect(screen.getByRole("region", { name: "Contabilizar 2" })).toHaveTextContent(
      "2 seleccionadas · US$ 185.40",
    );
  });

  it("contabiliza por lote y quita de la bandeja las que recibieron número", async () => {
    let pendientes = [LUZ, VENTA, ALQUILER];
    const peticiones = simularApi({
      [BORRADORES]: () => ({ cuerpo: pendientes }),
      [SUCURSALES]: SUCURSALES_RESP,
      [`POST /empresas/${E}/partidas/contabilizar`]: () => {
        pendientes = [VENTA];
        return {
          cuerpo: {
            contabilizadas: [
              { id: "p3", numero: 1, ambito: "2026" },
              { id: "p1", numero: 2, ambito: "2026" },
            ],
            rechazadas: [],
          },
        };
      },
    });
    const { usuario } = abrir();

    await conceptos();
    await usuario.click(screen.getByRole("checkbox", { name: "Seleccionar todas las partidas que cuadran" }));
    await usuario.click(screen.getByRole("button", { name: "Contabilizar 2" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Contabilizar 2 partidas?" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Contabilizar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // En orden de fecha, como recibirán su número
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({ ids: ["p3", "p1"] });
    await waitFor(async () => expect(await conceptos()).toEqual(["Venta de contado"]));
    expect(screen.queryByRole("region", { name: /Contabilizar/ })).not.toBeInTheDocument();
  });

  it("muestra el error de carga con opción de reintentar", async () => {
    simularApi({
      [BORRADORES]: { estado: 403, cuerpo: { message: "No tiene permiso para ver partidas" } },
      [SUCURSALES]: SUCURSALES_RESP,
    });
    abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent("No tiene permiso para ver partidas");
  });
});
