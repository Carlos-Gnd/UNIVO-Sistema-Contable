import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import ExcelJS from "exceljs";
import type { LibroMayor } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { crearExcelLibroMayor, htmlLibroMayor } from "./exportar";
import { PantallaLibroMayor } from "./pantalla-libro-mayor";

const E = "e1";
const S1 = "20000000-0000-4000-8000-000000000001";
const CAJA = "10000000-0000-4000-8000-000000000004";
const EFECTIVO = "10000000-0000-4000-8000-000000000003";
const MAYOR = (cuentaId: string) => `GET /empresas/${E}/cuentas/${cuentaId}/libro-mayor`;
const VER: CodigoPermiso[] = ["reportes.ver"];
const EXPORTAR: CodigoPermiso[] = ["reportes.ver", "reportes.exportar"];

const cuenta = (id: string, codigo: string, nombre: string, nivel: number) => ({
  id,
  codigo,
  nombre,
  nivel,
  naturaleza: "deudora",
  tipo: "activo",
  cuentaPadreId: null,
  activa: true,
});

const BASE = {
  [`GET /empresas/${E}/cuentas`]: {
    cuerpo: [
      cuenta(CAJA, "110101", "Caja general", 4),
      cuenta(EFECTIVO, "1101", "Efectivo y equivalentes", 3),
    ],
  },
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

const libro = (extra: Partial<LibroMayor> = {}): LibroMayor => ({
  cuentaId: CAJA,
  codigo: "110101",
  nombre: "Caja general",
  naturaleza: "deudora",
  desde: "2026-11-01",
  hasta: "2026-11-30",
  saldoInicial: "1000.00",
  movimientos: [
    {
      fecha: "2026-11-03",
      partidaId: "p1",
      numero: 1,
      tipo: "operacion",
      concepto: "Venta al contado",
      sucursalId: S1,
      sucursal: "Casa matriz",
      cuentaCodigo: "110101",
      cuentaNombre: "Caja general",
      debe: "113.00",
      haber: "0.00",
      saldo: "1113.00",
    },
    {
      fecha: "2026-11-05",
      partidaId: "p2",
      numero: 2,
      tipo: "operacion",
      concepto: "Pago de energía",
      sucursalId: S1,
      sucursal: "Casa matriz",
      cuentaCodigo: "110101",
      cuentaNombre: "Caja general",
      debe: "0.00",
      haber: "85.40",
      saldo: "1027.60",
    },
  ],
  totalDebe: "113.00",
  totalHaber: "85.40",
  saldoFinal: "1027.60",
  ...extra,
});

/** Elige la cuenta cuando el catálogo ya cargó (antes el selector está deshabilitado). */
async function elegirCuenta(usuario: UserEvent, cuentaId: string) {
  const selector = await screen.findByLabelText("Cuenta");
  await waitFor(() => expect(selector).toBeEnabled());
  await usuario.selectOptions(selector, cuentaId);
}

const abrir = (permisos: CodigoPermiso[] = VER) =>
  renderizar(<PantallaLibroMayor parametros={{ empresaId: E }} />, { permisos });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 20, 9, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("pantalla del libro mayor (S2-T22)", () => {
  it("pide elegir una cuenta, ordenadas por código, y no consulta hasta entonces", async () => {
    const peticiones = simularApi(BASE);
    abrir();

    expect(await screen.findByText("Elige una cuenta para ver su libro mayor.")).toBeInTheDocument();
    const opciones = within(screen.getByLabelText("Cuenta"))
      .getAllByRole("option")
      .map((o) => o.getAttribute("value"));
    expect(opciones).toEqual(["", EFECTIVO, CAJA]);
    expect(peticiones.some((p) => p.ruta.endsWith("/libro-mayor"))).toBe(false);
  });

  it("muestra el saldo inicial, los movimientos con su saldo acumulado y los totales", async () => {
    const peticiones = simularApi({ ...BASE, [MAYOR(CAJA)]: { cuerpo: libro() } });
    const { usuario } = abrir();

    await elegirCuenta(usuario, CAJA);
    const tabla = await screen.findByRole("table", { name: "Libro mayor 110101" });
    const filas = within(tabla)
      .getAllByRole("row")
      .slice(1)
      .map((f) => f.textContent);
    expect(filas).toEqual([
      "Saldo inicial1,000.00",
      "03/11/2026n.º 1Venta al contadoCasa matriz113.000.001,113.00",
      "05/11/2026n.º 2Pago de energíaCasa matriz0.0085.401,027.60",
      "Totales y saldo final113.0085.401,027.60",
    ]);
    expect(within(tabla).getByRole("link", { name: "n.º 1" })).toHaveAttribute(
      "href",
      `/empresas/${E}/partidas/p1`,
    );
    const consulta = peticiones.find((p) => p.ruta.endsWith("/libro-mayor"))!.consulta;
    expect(Object.fromEntries(consulta)).toEqual({ desde: "2026-11-01", hasta: "2026-11-30" });
  });

  it("en una cuenta de mayor agrega la columna de la subcuenta", async () => {
    const movimiento = { ...libro().movimientos[0]!, cuentaCodigo: "110102", cuentaNombre: "Caja chica" };
    simularApi({
      ...BASE,
      [MAYOR(EFECTIVO)]: {
        cuerpo: libro({ cuentaId: EFECTIVO, codigo: "1101", nombre: "Efectivo", movimientos: [movimiento] }),
      },
    });
    const { usuario } = abrir();

    await elegirCuenta(usuario, EFECTIVO);
    const tabla = await screen.findByRole("table", { name: "Libro mayor 1101" });
    expect(within(tabla).getByRole("columnheader", { name: "Subcuenta" })).toBeInTheDocument();
    expect(within(tabla).getByText("Caja chica")).toBeInTheDocument();
  });

  it("filtra por sucursal", async () => {
    const peticiones = simularApi({ ...BASE, [MAYOR(CAJA)]: { cuerpo: libro() } });
    const { usuario } = abrir();
    await elegirCuenta(usuario, CAJA);
    await screen.findByRole("table", { name: "Libro mayor 110101" });

    await usuario.selectOptions(screen.getByLabelText("Sucursal"), "Casa matriz");
    await waitFor(() =>
      expect(
        peticiones
          .filter((p) => p.ruta.endsWith("/libro-mayor"))
          .at(-1)
          ?.consulta.get("sucursalId"),
      ).toBe(S1),
    );
  });

  it("avisa cuando la cuenta no tiene movimientos", async () => {
    simularApi({
      ...BASE,
      [MAYOR(CAJA)]: {
        cuerpo: libro({ movimientos: [], totalDebe: "0.00", totalHaber: "0.00", saldoFinal: "1000.00" }),
      },
    });
    const { usuario } = abrir();
    await elegirCuenta(usuario, CAJA);
    expect(await screen.findByText("La cuenta no tiene movimientos en el período.")).toBeInTheDocument();
  });

  it("solo ofrece exportar con reportes.exportar", async () => {
    simularApi({ ...BASE, [MAYOR(CAJA)]: { cuerpo: libro() } });
    const { usuario } = abrir(VER);
    await elegirCuenta(usuario, CAJA);
    await screen.findByRole("table", { name: "Libro mayor 110101" });
    expect(screen.queryByRole("button", { name: "Exportar Excel" })).not.toBeInTheDocument();
  });

  it("el PDF se genera en una ventana de impresión", async () => {
    simularApi({ ...BASE, [MAYOR(CAJA)]: { cuerpo: libro() } });
    const abrirVentana = vi.spyOn(window, "open").mockReturnValue(null);
    const { usuario } = abrir(EXPORTAR);
    await elegirCuenta(usuario, CAJA);

    await usuario.click(await screen.findByRole("button", { name: "Exportar PDF" }));
    expect(abrirVentana).toHaveBeenCalledWith("", "_blank");
  });
});

describe("exportación del libro mayor (S2-T23)", () => {
  const encabezado = { empresa: "CheroPhonex", periodo: "01/11/2026 al 30/11/2026", alcance: "Consolidado" };

  it("genera el Excel con encabezado, saldo inicial, movimientos y totales como números", async () => {
    const blob = await crearExcelLibroMayor(libro(), encabezado, new Date(2026, 10, 20));
    const archivo = new ExcelJS.Workbook();
    await archivo.xlsx.load(await blob.arrayBuffer());
    const hoja = archivo.getWorksheet("Libro mayor")!;

    expect(hoja.getCell("A1").value).toBe("CheroPhonex");
    expect(hoja.getCell("A2").value).toBe("Libro mayor: 110101 Caja general");
    expect(hoja.getRow(6).values).toEqual([
      undefined,
      "Fecha",
      "Partida",
      "Concepto",
      "Sucursal",
      "Debe",
      "Haber",
      "Saldo",
    ]);
    expect(hoja.getRow(7).getCell(1).value).toBe("Saldo inicial");
    expect(hoja.getRow(7).getCell(7).value).toBe(1000);
    expect(hoja.getRow(8).values).toEqual([
      undefined,
      "03/11/2026",
      1,
      "Venta al contado",
      "Casa matriz",
      113,
      0,
      1113,
    ]);
    expect(hoja.getRow(10).getCell(1).value).toBe("Totales y saldo final");
    expect(hoja.getRow(10).getCell(7).value).toBe(1027.6);
  });

  it("el documento para PDF escapa el texto y lleva los totales", () => {
    const html = htmlLibroMayor(
      libro({ movimientos: [{ ...libro().movimientos[0]!, concepto: "<b>Venta</b> & otros" }] }),
      encabezado,
    );
    expect(html).toContain("&lt;b&gt;Venta&lt;/b&gt; &amp; otros");
    expect(html).toContain("Totales y saldo final");
    expect(html).toContain("1,027.60");
  });
});
