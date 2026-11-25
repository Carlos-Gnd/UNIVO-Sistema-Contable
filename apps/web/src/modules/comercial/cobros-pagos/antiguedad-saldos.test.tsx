import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { AntiguedadSaldos as Reporte } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaCobrosPagos } from "./pantalla-cobros-pagos";
import { crearAntiguedadExcel, crearDocumentoAntiguedad } from "./antiguedad-exportar";

const E = "e1";
const PERMISOS: CodigoPermiso[] = ["operaciones.ver", "operaciones.registrar", "tesoreria.ver"];

const reporte = (extra: Partial<Reporte> = {}): Reporte => ({
  operacion: "venta",
  alFecha: "2026-10-31",
  filas: [
    {
      tercero: { id: "t1", nombre: "Tecno Plaza" },
      tramos: { corriente: "113.00", d1_30: "226.00", d31_60: "565.00", d61_90: "0.00", mas_90: "1130.00" },
      total: "2034.00",
      documentos: [
        {
          documentoId: "d1",
          tipoDocumento: "ccf",
          numeroDocumento: "CCF-0001",
          fecha: "2026-06-01",
          fechaVencimiento: "2026-07-01",
          diasVencido: 122,
          tramo: "mas_90",
          saldo: "1130.00",
        },
      ],
    },
    {
      tercero: { id: "t2", nombre: "Zeta Cómputo" },
      tramos: { corriente: "339.00", d1_30: "0.00", d31_60: "0.00", d61_90: "0.00", mas_90: "0.00" },
      total: "339.00",
      documentos: [],
    },
  ],
  totales: {
    corriente: "452.00",
    d1_30: "226.00",
    d31_60: "565.00",
    d61_90: "0.00",
    mas_90: "1130.00",
    total: "2373.00",
  },
  cuadre: {
    cuenta: "1103",
    saldoMayor: "2373.00",
    saldoReporte: "2373.00",
    diferencia: "0.00",
    cuadra: true,
  },
  ...extra,
});

const apoyo = {
  [`GET /empresas/${E}`]: { cuerpo: { id: E, nombre: "CheroPhonex", clasificacion: "otro" } },
  [`GET /empresas/${E}/abonos/pendientes`]: { cuerpo: [] },
  [`GET /empresas/${E}/abonos`]: { cuerpo: [] },
};

async function abrirPestana() {
  const r = renderizar(<PantallaCobrosPagos parametros={{ empresaId: E }} />, { permisos: PERMISOS });
  await r.usuario.click(await screen.findByRole("tab", { name: "Antigüedad de saldos" }));
  return r;
}

describe("antigüedad de saldos (HU-63, S3-T74)", () => {
  it("muestra por cliente los cinco tramos, los totales y que cuadra con el mayor", async () => {
    const peticiones = simularApi({
      ...apoyo,
      [`GET /empresas/${E}/antiguedad-saldos`]: { cuerpo: reporte() },
    });
    await abrirPestana();
    const fila = (await screen.findByText("Tecno Plaza")).closest("tr")!;
    expect(within(fila).getByText("2,034.00")).toBeInTheDocument();
    expect(within(fila).getByText("1,130.00")).toBeInTheDocument();
    const totales = screen.getByText("Totales").closest("tr")!;
    expect(within(totales).getByText("2,373.00")).toBeInTheDocument();
    expect(screen.getByText("Cuadra con la cuenta 1103 del mayor.")).toBeInTheDocument();
    expect(screen.getByLabelText("Antigüedad de saldos · clientes")).toHaveTextContent(
      "Más de 90US$ 1,130.00",
    );
    const consulta = peticiones.find((p) => p.ruta === `/empresas/${E}/antiguedad-saldos`)!.consulta;
    expect(consulta.get("operacion")).toBe("venta");
  });

  it("cambia a proveedores y a otra fecha de corte, y consulta de nuevo", async () => {
    const peticiones = simularApi({
      ...apoyo,
      [`GET /empresas/${E}/antiguedad-saldos`]: ({ consulta }) => ({
        cuerpo: reporte({ operacion: consulta.get("operacion") === "compra" ? "compra" : "venta" }),
      }),
    });
    const { usuario } = await abrirPestana();
    await screen.findByText("Tecno Plaza");
    await usuario.click(screen.getByRole("button", { name: "Proveedores" }));
    const fecha = screen.getByLabelText("Al corte");
    await usuario.clear(fecha);
    await usuario.type(fecha, "2026-10-15");
    await waitFor(() => {
      const ultima = peticiones.filter((p) => p.ruta === `/empresas/${E}/antiguedad-saldos`).at(-1)!;
      expect(Object.fromEntries(ultima.consulta)).toEqual({ operacion: "compra", alFecha: "2026-10-15" });
    });
    expect(await screen.findByText("Antigüedad de saldos · proveedores")).toBeInTheDocument();
  });

  it("avisa cuando no cuadra con el mayor y cuando no hay saldos", async () => {
    simularApi({
      ...apoyo,
      [`GET /empresas/${E}/antiguedad-saldos`]: {
        cuerpo: reporte({
          cuadre: {
            cuenta: "1103",
            saldoMayor: "2423.00",
            saldoReporte: "2373.00",
            diferencia: "50.00",
            cuadra: false,
          },
        }),
      },
    });
    await abrirPestana();
    expect(
      await screen.findByText(
        /No cuadra con la cuenta 1103 del mayor \(US\$ 2,423\.00\): diferencia de US\$ 50\.00/,
      ),
    ).toBeInTheDocument();
  });

  it("sin saldos lo dice", async () => {
    simularApi({
      ...apoyo,
      [`GET /empresas/${E}/antiguedad-saldos`]: {
        cuerpo: reporte({
          filas: [],
          totales: {
            corriente: "0.00",
            d1_30: "0.00",
            d31_60: "0.00",
            d61_90: "0.00",
            mas_90: "0.00",
            total: "0.00",
          },
        }),
      },
    });
    await abrirPestana();
    expect(await screen.findByText("Ningún cliente tiene saldo a esta fecha.")).toBeInTheDocument();
  });

  it("el PDF incluye cada cliente, su detalle por documento y los totales", () => {
    const html = crearDocumentoAntiguedad(reporte(), { empresa: "CheroPhonex <S.A.>" });
    expect(html).toContain("CheroPhonex &lt;S.A.&gt;");
    expect(html).toContain("Tecno Plaza");
    expect(html).toContain("CCF-0001");
    expect(html).toContain("122 días de atraso");
    expect(html).toContain("2,373.00");
    expect(html).toContain("Cuadra con la cuenta 1103 del mayor.");
  });

  it("el Excel se genera con una hoja de cálculo válida", async () => {
    const archivo = await crearAntiguedadExcel(reporte(), { empresa: "CheroPhonex" });
    expect(archivo.type).toContain("spreadsheetml");
    const modulo = await import("exceljs");
    const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await archivo.arrayBuffer());
    const hoja = libro.getWorksheet("Antigüedad")!;
    expect(hoja.getRow(6).getCell(1).value).toBe("Tecno Plaza");
    expect(hoja.getRow(6).getCell(7).value).toBe(2034);
    expect(hoja.getRow(8).getCell(7).value).toBe(2373);
  });

  it("el botón PDF abre la ventana de impresión", async () => {
    simularApi({ ...apoyo, [`GET /empresas/${E}/antiguedad-saldos`]: { cuerpo: reporte() } });
    const abrir = vi.fn(() => null);
    vi.stubGlobal("open", abrir);
    const { usuario } = await abrirPestana();
    await screen.findByText("Tecno Plaza");
    await usuario.click(screen.getByRole("button", { name: "PDF" }));
    expect(abrir).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
