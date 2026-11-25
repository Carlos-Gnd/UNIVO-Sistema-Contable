import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { KardexVista, SucursalDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { crearExcelKardex, htmlKardex } from "./exportar";
import { PantallaKardex } from "./pantalla-kardex";

const E = "e1";
// Los identificadores de la API son UUID: el formulario valida con el mismo esquema que el servidor
const P1 = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222221";
const S2 = "22222222-2222-4222-8222-222222222222";
const VER: CodigoPermiso[] = ["inventario.ver"];
const REGISTRAR: CodigoPermiso[] = ["inventario.ver", "inventario.registrar"];

const sucursal = (id: string, nombre: string, extra: Partial<SucursalDetalle> = {}): SucursalDetalle => ({
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
  ...extra,
});
const MATRIZ = sucursal(S1, "Casa matriz", { esMatriz: true });
const USULUTAN = sucursal(S2, "Usulután");

const PRODUCTO = {
  id: P1,
  codigo: "CP-01",
  nombre: "Samsung Galaxy S24",
  categoriaId: null,
  categoria: null,
  unidadMedida: "unidad",
  precioVenta: "800.00",
  existenciaMinima: "0.0000",
  metodoValuacion: null,
  controlaSeries: false,
  activo: true,
};
const PRODUCTO_SERIADO = { ...PRODUCTO, controlaSeries: true };

const saldo = (cantidad: string, costoTotal: string, costoUnitario: string) => ({
  cantidad,
  costoTotal,
  costoUnitario,
});
const KARDEX: KardexVista = {
  productoId: P1,
  codigo: "CP-01",
  nombre: "Samsung Galaxy S24",
  unidadMedida: "unidad",
  sucursalId: S1,
  metodo: "promedio_ponderado",
  desde: null,
  hasta: null,
  saldoInicial: saldo("0.0000", "0.00", "0.0000"),
  lineas: [
    {
      id: "m1",
      fecha: "2026-10-04",
      referencia: "CCF-P001",
      entrada: { cantidad: "8.0000", costoUnitario: "590.0000", costoTotal: "4720.00" },
      salida: null,
      saldo: saldo("8.0000", "4720.00", "590.0000"),
    },
    {
      id: "m2",
      fecha: "2026-10-08",
      referencia: null,
      entrada: null,
      salida: { cantidad: "2.5000", costoUnitario: "590.0000", costoTotal: "1475.00" },
      saldo: saldo("5.5000", "3245.00", "590.0000"),
    },
  ],
  totales: {
    entradaCantidad: "8.0000",
    entradaTotal: "4720.00",
    salidaCantidad: "2.5000",
    salidaTotal: "1475.00",
  },
  saldoFinal: saldo("5.5000", "3245.00", "590.0000"),
};

const RUTA_KARDEX = `GET /empresas/${E}/productos/${P1}/kardex`;

function api(extra: Parameters<typeof simularApi>[0] = {}) {
  return simularApi({
    [`GET /empresas/${E}/productos`]: { cuerpo: [PRODUCTO] },
    [`GET /empresas/${E}/sucursales`]: { cuerpo: [USULUTAN, MATRIZ] },
    [`GET /empresas/${E}`]: { cuerpo: { nombre: "CheroPhonex", nombreComercial: "CheroPhonex" } },
    [RUTA_KARDEX]: { cuerpo: KARDEX },
    ...extra,
  });
}

const abrir = (permisos: CodigoPermiso[] = VER) =>
  renderizar(<PantallaKardex parametros={{ empresaId: E }} />, { permisos });

/** Espera a que lleguen los productos (el selector está deshabilitado mientras cargan) y elige el primero. */
async function elegirProducto(usuario: ReturnType<typeof renderizar>["usuario"]) {
  await screen.findByRole("option", { name: /CP-01/ });
  await usuario.selectOptions(screen.getByLabelText("Producto"), P1);
}

describe("pantalla del kardex (HU-65, S3-T80)", () => {
  it("pide elegir un producto y no consulta el kardex hasta entonces", async () => {
    const peticiones = api();
    abrir();
    expect(await screen.findByText("Elige un producto para ver su kardex.")).toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta.endsWith("/kardex"))).toBe(false);
  });

  it("muestra entradas, salidas y saldo en unidades y valores con su total", async () => {
    api();
    const { usuario } = abrir();
    await elegirProducto(usuario);

    const tabla = await screen.findByRole("table", { name: "Kardex CP-01" });
    const filas = within(tabla).getAllByRole("row");
    const compra = within(filas.find((f) => within(f).queryByText("CCF-P001"))!);
    expect(compra.getByText("04/10/2026")).toBeInTheDocument();
    expect(compra.getAllByText("4,720.00")).toHaveLength(2); // entrada y saldo
    expect(compra.getAllByText("590.00").length).toBeGreaterThan(0);
    const venta = within(filas.find((f) => within(f).queryByText("08/10/2026"))!);
    expect(venta.getByText("2.5")).toBeInTheDocument(); // cantidad sin ceros sobrantes
    expect(venta.getByText("1,475.00")).toBeInTheDocument();
    expect(venta.getByText("3,245.00")).toBeInTheDocument();
    const totales = within(filas.find((f) => within(f).queryByText("Totales del período"))!);
    expect(totales.getByText("4,720.00")).toBeInTheDocument();
    expect(totales.getByText("1,475.00")).toBeInTheDocument();
    expect(screen.getByText("Costo promedio ponderado")).toBeInTheDocument();
  });

  it("usa la casa matriz por defecto y envía sucursal y período a la API", async () => {
    const peticiones = api();
    const { usuario } = abrir();
    await elegirProducto(usuario);
    await screen.findByRole("table", { name: "Kardex CP-01" });
    expect(screen.getByLabelText("Sucursal")).toHaveValue(S1);

    await usuario.type(screen.getByLabelText("Desde"), "2026-10-01");
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S2);
    await waitFor(() => {
      const ultima = peticiones.filter((p) => p.ruta.endsWith("/kardex")).at(-1)!;
      expect(Object.fromEntries(ultima.consulta)).toEqual({ sucursalId: S2, desde: "2026-10-01" });
    });
  });

  it("no consulta si la fecha inicial es posterior a la final", async () => {
    const peticiones = api();
    const { usuario } = abrir();
    await elegirProducto(usuario);
    await screen.findByRole("table", { name: "Kardex CP-01" });
    const antes = peticiones.length;

    await usuario.type(screen.getByLabelText("Desde"), "2026-10-20");
    await usuario.type(screen.getByLabelText("Hasta"), "2026-10-01");

    expect(
      await screen.findByText("La fecha inicial no puede ser posterior a la final."),
    ).toBeInTheDocument();
    expect(
      peticiones
        .slice(antes)
        .filter((p) => p.ruta.endsWith("/kardex") && p.consulta.get("hasta") === "2026-10-01"),
    ).toHaveLength(0);
  });

  it("explica el error de la API con opción de reintentar", async () => {
    api({ [RUTA_KARDEX]: { estado: 500, cuerpo: { message: "Falló la consulta" } } });
    const { usuario } = abrir();
    await elegirProducto(usuario);
    expect(await screen.findByText(/No se pudo cargar el kardex/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("sin permiso de inventario avisa y no consulta nada", async () => {
    const peticiones = api();
    abrir([]);
    expect(
      await screen.findByText("Tu rol no permite consultar el inventario en esta empresa."),
    ).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("solo quien registra ve el botón de registrar movimiento", async () => {
    api();
    const { usuario } = abrir(VER);
    await elegirProducto(usuario);
    await screen.findByRole("table", { name: "Kardex CP-01" });
    expect(screen.queryByRole("button", { name: "Registrar movimiento" })).not.toBeInTheDocument();
  });

  it("registra una entrada con su costo unitario y refresca el kardex", async () => {
    const peticiones = api({
      [`POST /empresas/${E}/movimientos-inventario`]: { estado: 201, cuerpo: { id: "m3" } },
    });
    const { usuario } = abrir(REGISTRAR);
    await elegirProducto(usuario);
    await screen.findByRole("table", { name: "Kardex CP-01" });

    await usuario.click(screen.getByRole("button", { name: "Registrar movimiento" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Cantidad"), "4");
    await usuario.type(within(dialogo).getByLabelText("Costo unitario"), "600");
    await usuario.type(within(dialogo).getByLabelText("Referencia (documento)"), "CCF-P009");
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({
      productoId: P1,
      sucursalId: S1,
      tipo: "entrada",
      cantidad: "4.0000",
      costoUnitario: "600.0000",
      referencia: "CCF-P009",
    });
    await waitFor(() =>
      expect(peticiones.filter((p) => p.ruta.endsWith("/kardex")).length).toBeGreaterThan(1),
    );
  });

  it("una salida no pide costo y muestra el rechazo de la API por falta de existencias", async () => {
    api({
      [`POST /empresas/${E}/movimientos-inventario`]: {
        estado: 422,
        cuerpo: { message: "Existencia insuficiente: hay 5.5000 y se piden 9.0000." },
      },
    });
    const { usuario } = abrir(REGISTRAR);
    await elegirProducto(usuario);
    await screen.findByRole("table", { name: "Kardex CP-01" });

    await usuario.click(screen.getByRole("button", { name: "Registrar movimiento" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.selectOptions(within(dialogo).getByLabelText("Tipo"), "salida");
    expect(within(dialogo).queryByLabelText("Costo unitario")).not.toBeInTheDocument();
    await usuario.type(within(dialogo).getByLabelText("Cantidad"), "9");
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar" }));

    expect(await within(dialogo).findByText(/Existencia insuficiente/)).toBeInTheDocument();
  });

  it("registra la entrada seriada con una serie por unidad y costo normalizado", async () => {
    const peticiones = api({
      [`GET /empresas/${E}/productos`]: { cuerpo: [PRODUCTO_SERIADO] },
      [`POST /empresas/${E}/movimientos-inventario`]: { estado: 201, cuerpo: { id: "m4" } },
    });
    const { usuario } = abrir(REGISTRAR);
    await elegirProducto(usuario);
    await screen.findByRole("table", { name: "Kardex CP-01" });

    await usuario.click(screen.getByRole("button", { name: "Registrar movimiento" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Costo unitario"), "10.005");
    await usuario.type(within(dialogo).getByLabelText("Series o IMEI, una por línea"), " imei-a \nIMEI-B ");
    await usuario.type(within(dialogo).getByLabelText("Referencia (documento)"), "Entrada seriada");
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
      productoId: P1,
      sucursalId: S1,
      tipo: "entrada",
      cantidad: "2.0000",
      fecha: expect.any(String),
      costoUnitario: "10.0050",
      referencia: "Entrada seriada",
      series: ["IMEI-A", "IMEI-B"],
    });
  });

  it("permite elegir solo series disponibles y envía exactamente las elegidas en la salida", async () => {
    const seriesRuta = `GET /empresas/${E}/productos/${P1}/series`;
    const disponibles = [
      {
        id: "33333333-3333-4333-8333-333333333331",
        productoId: P1,
        sucursalId: S1,
        numeroSerie: "IMEI-A",
        costoUnitario: "10.00",
        estado: "en_existencia",
        fechaEntrada: "2026-10-01",
        fechaSalida: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333332",
        productoId: P1,
        sucursalId: S1,
        numeroSerie: "IMEI-B",
        costoUnitario: "12.00",
        estado: "en_existencia",
        fechaEntrada: "2026-10-02",
        fechaSalida: null,
      },
    ];
    const peticiones = api({
      [`GET /empresas/${E}/productos`]: { cuerpo: [PRODUCTO_SERIADO] },
      [seriesRuta]: { cuerpo: disponibles },
      [`POST /empresas/${E}/movimientos-inventario`]: { estado: 201, cuerpo: { id: "m5" } },
    });
    const { usuario } = abrir(REGISTRAR);
    await elegirProducto(usuario);
    await screen.findByRole("table", { name: "Kardex CP-01" });
    await usuario.click(screen.getByRole("button", { name: "Registrar movimiento" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.selectOptions(within(dialogo).getByLabelText("Tipo"), "salida");
    await usuario.click(await within(dialogo).findByLabelText(/IMEI-B/));
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    expect(peticiones.find((p) => p.ruta.endsWith("/series"))?.consulta).toEqual(
      new URLSearchParams({ sucursalId: S1, estado: "en_existencia" }),
    );
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
      productoId: P1,
      sucursalId: S1,
      tipo: "salida",
      cantidad: "1.0000",
      fecha: expect.any(String),
      series: ["IMEI-B"],
    });
  });
});

describe("exportación del kardex (HU-65)", () => {
  const encabezado = { empresa: "CheroPhonex <demo>", sucursal: "Casa matriz" };

  it("el documento para imprimir trae el método, los montos con formato y escapa el HTML", () => {
    const html = htmlKardex({ ...KARDEX, nombre: "Samsung <S24>" }, encabezado);
    expect(html).toContain("Costo promedio ponderado");
    expect(html).toContain("4,720.00");
    expect(html).toContain("1,475.00");
    expect(html).toContain("2.5");
    expect(html).toContain("Samsung &lt;S24&gt;");
    expect(html).toContain("CheroPhonex &lt;demo&gt;");
    expect(html).not.toContain("Samsung <S24>");
  });

  it("el Excel tiene importes numéricos, saldo inicial, movimientos y totales", async () => {
    const blob = await crearExcelKardex(KARDEX, encabezado, new Date("2026-11-23T12:00:00Z"));
    const ExcelJS = (await import("exceljs")).default;
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await blob.arrayBuffer());
    const hoja = libro.getWorksheet("Kardex")!;
    const celdas = (n: number) => hoja.getRow(n).values as unknown[];
    expect(hoja.getCell("A2").value).toBe("Kardex: CP-01 Samsung Galaxy S24 (unidad)");
    expect(celdas(8)[1]).toBe("Saldo inicial");
    expect(celdas(9)).toEqual(expect.arrayContaining(["04/10/2026", "CCF-P001", 8, 590, 4720]));
    expect(celdas(10)).toEqual(expect.arrayContaining(["08/10/2026", 2.5, 590, 1475, 5.5, 3245]));
    expect(celdas(11)).toEqual(expect.arrayContaining(["Totales del período", 4720, 1475]));
  });
});
