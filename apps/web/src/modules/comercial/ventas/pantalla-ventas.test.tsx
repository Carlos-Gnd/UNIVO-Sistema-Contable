import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type {
  CuentaTesoreriaVista,
  SerieInventarioVista,
  DocumentoComercialResumen,
  DocumentoComercialVista,
  ProductoVista,
  SucursalDetalle,
  TerceroVista,
} from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaVentas } from "./pantalla-ventas";

const E = "e1";
const ADMIN: CodigoPermiso[] = ["operaciones.ver", "operaciones.registrar", "tesoreria.ver"];
const SOLO_VER: CodigoPermiso[] = ["operaciones.ver"];

const VENTAS = `GET /empresas/${E}/ventas`;
const TERCEROS = `GET /empresas/${E}/terceros`;
const PRODUCTOS = `GET /empresas/${E}/productos`;
const SUCURSALES = `GET /empresas/${E}/sucursales`;
const CUENTAS_TESORERIA = `GET /empresas/${E}/cuentas-tesoreria`;
const CATALOGO = `GET /empresas/${E}/cuentas`;
const EMPRESA = `GET /empresas/${E}`;

const CLIENTE = "11111111-1111-4111-8111-111111111111";
const PRODUCTO = "22222222-2222-4222-8222-222222222222";
const SUCURSAL = "33333333-3333-4333-8333-333333333333";
const CAJA = "44444444-4444-4444-8444-444444444444";

const resumen = (extra: Partial<DocumentoComercialResumen> = {}): DocumentoComercialResumen => ({
  id: "d1",
  operacion: "venta",
  tipoDocumento: "ccf",
  numeroDocumento: "CCF-0001",
  numeroDocumentoHasta: null,
  fecha: "2026-10-08",
  sucursalId: SUCURSAL,
  tercero: { id: CLIENTE, nombre: "Tecno Plaza San Miguel", nit: "1234-567890-123-0", nrc: "245871-4" },
  condicionPago: "contado",
  cuentaPagoId: CAJA,
  diasCredito: 0,
  fechaVencimiento: null,
  totalGravado: "2740.50",
  totalExento: "0.00",
  totalNoSujeto: "0.00",
  iva: "356.27",
  ivaPercibido: "0.00",
  ivaRetenido: "0.00",
  total: "3096.77",
  totalNeto: "3096.77",
  partidaId: "p1",
  estadoPartida: "borrador",
  partidaCostoId: "p2",
  observaciones: null,
  ...extra,
});

const detalle = (): DocumentoComercialVista => ({
  ...resumen(),
  lineas: [
    {
      orden: 1,
      productoId: PRODUCTO,
      productoCodigo: "CP-01",
      cuentaId: null,
      descripcion: "Samsung Galaxy S24",
      clase: "gravada",
      cantidad: "1.0000",
      precioUnitario: "2740.5000",
      monto: "2740.50",
      costoKardex: "2030.00",
    },
  ],
});

const cliente: TerceroVista = {
  id: CLIENTE,
  nombre: "Tecno Plaza San Miguel",
  nit: "1234-567890-123-0",
  nrc: "245871-4",
  actividadEconomica: null,
  clasificacion: "otro",
  direccion: null,
  telefono: null,
  correo: null,
  esCliente: true,
  esProveedor: false,
  diasCredito: 15,
  activo: true,
};
const producto: ProductoVista = {
  id: PRODUCTO,
  codigo: "CP-01",
  nombre: "Samsung Galaxy S24",
  categoriaId: null,
  categoria: null,
  unidadMedida: "unidad",
  precioVenta: "100.00",
  existenciaMinima: "0.0000",
  metodoValuacion: null,
  controlaSeries: false,
  activo: true,
};
const sucursal: SucursalDetalle = {
  id: SUCURSAL,
  empresaId: E,
  nombre: "Casa matriz",
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "0001",
  direccion: null,
  esMatriz: true,
  activa: true,
  creadoEn: "2026-01-01T00:00:00Z",
  actualizadoEn: "2026-01-01T00:00:00Z",
};
const caja = {
  id: "ct1",
  tipo: "caja",
  nombre: "Caja general",
  banco: null,
  numeroCuenta: null,
  cuentaId: CAJA,
  cuentaCodigo: "110101",
  cuentaNombre: "Caja General",
  sucursalId: null,
  sucursal: null,
  activa: true,
  saldo: "0.00",
} satisfies CuentaTesoreriaVista;

const apoyo = {
  [TERCEROS]: { cuerpo: [cliente] },
  [PRODUCTOS]: { cuerpo: [producto] },
  [SUCURSALES]: { cuerpo: [sucursal] },
  [CUENTAS_TESORERIA]: { cuerpo: [caja] },
  [CATALOGO]: { cuerpo: [] },
  [EMPRESA]: { cuerpo: { id: E, clasificacion: "otro" } },
};

const cuenta = (codigo: string, nombre: string) => ({
  id: `c-${codigo}`,
  codigo,
  nombre,
  nivel: 4,
  naturaleza: "deudora" as const,
  tipo: "activo" as const,
  cuentaPadreId: null,
  activa: true,
});

const abrir = (permisos: CodigoPermiso[] = ADMIN) =>
  renderizar(<PantallaVentas parametros={{ empresaId: E }} />, { permisos });

describe("pantalla de ventas (HU-60, S3-T65)", () => {
  it("lista las ventas con su cliente, consumidor final con resumen de números y el estado de la partida", async () => {
    simularApi({
      [VENTAS]: {
        cuerpo: [
          resumen(),
          resumen({
            id: "d2",
            tipoDocumento: "factura",
            numeroDocumento: "FCF-00001",
            numeroDocumentoHasta: "FCF-00015",
            tercero: null,
            estadoPartida: "contabilizada",
          }),
        ],
      },
    });
    abrir();

    const fila = (await screen.findByText(/CCF CCF-0001/)).closest("tr")!;
    expect(within(fila).getByText("Tecno Plaza San Miguel")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 356.27")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 3,096.77")).toBeInTheDocument();
    expect(within(fila).getByText("Borrador")).toBeInTheDocument();
    const cf = screen.getByText(/Factura FCF-00001/).closest("tr")!;
    expect(within(cf).getByText(/al FCF-00015/)).toBeInTheDocument();
    expect(within(cf).getByText("Consumidor final")).toBeInTheDocument();
    expect(within(cf).getByText("Contabilizada")).toBeInTheDocument();
  });

  it("sin permiso de registrar solo se consulta", async () => {
    simularApi({ [VENTAS]: { cuerpo: [resumen()] } });
    abrir(SOLO_VER);
    await screen.findByText(/CCF CCF-0001/);
    expect(screen.queryByRole("button", { name: "Registrar venta" })).not.toBeInTheDocument();
  });

  it("envía la búsqueda a la API", async () => {
    const peticiones = simularApi({ [VENTAS]: { cuerpo: [] } });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay ventas/);
    await usuario.type(screen.getByRole("searchbox", { name: /Buscar por número/ }), "tecno");
    await waitFor(() => {
      const ultima = peticiones.filter((p) => p.ruta === `/empresas/${E}/ventas`).at(-1)!;
      expect(Object.fromEntries(ultima.consulta)).toEqual({ busqueda: "tecno" });
    });
  });

  it("el detalle muestra el costo de ventas del kardex y las dos partidas", async () => {
    simularApi({
      [VENTAS]: { cuerpo: [resumen()] },
      [`GET /empresas/${E}/ventas/d1`]: { cuerpo: detalle() },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Ver detalle de CCF-0001" }));
    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByText("CP-01 · Samsung Galaxy S24")).toBeInTheDocument();
    expect(within(dialogo).getByText("US$ 2,030.00")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Partida de la venta: Borrador/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Partida del costo de ventas: Generada/)).toBeInTheDocument();
  });

  it("registra una venta con CCF: propone el precio del producto y envía el documento", async () => {
    const peticiones = simularApi({
      [VENTAS]: { cuerpo: [] },
      ...apoyo,
      [`POST /empresas/${E}/ventas`]: { estado: 201, cuerpo: detalle() },
    });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay ventas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar venta" }));
    const dialogo = await screen.findByRole("dialog");

    await usuario.type(within(dialogo).getByLabelText("Número del documento"), "ccf-0001");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Tecno Plaza San Miguel" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByLabelText("Cliente"), CLIENTE);
    await waitFor(() => expect(within(dialogo).getByRole("option", { name: /CP-01/ })).toBeInTheDocument());
    await usuario.selectOptions(within(dialogo).getByLabelText("Producto 1"), PRODUCTO);
    expect(within(dialogo).getByLabelText("Precio unitario 1")).toHaveValue("100.00");
    await usuario.clear(within(dialogo).getByLabelText("Cantidad 1"));
    await usuario.type(within(dialogo).getByLabelText("Cantidad 1"), "2");
    expect(within(dialogo).getByLabelText("Resumen del documento")).toHaveTextContent("US$ 226.00");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Caja general" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByLabelText("Se cobra en"), CAJA);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar y generar partidas" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({
      sucursalId: SUCURSAL,
      tipoDocumento: "ccf",
      numeroDocumento: "CCF-0001",
      terceroId: CLIENTE,
      condicionPago: "contado",
      cuentaPagoId: CAJA,
      lineas: [{ productoId: PRODUCTO, cantidad: "2.0000", precioUnitario: "100.0000" }],
    });
  });

  describe("series e IMEI (HU-66)", () => {
    const serie = (id: string, numeroSerie: string, costoUnitario: string): SerieInventarioVista => ({
      id,
      productoId: PRODUCTO,
      sucursalId: SUCURSAL,
      numeroSerie,
      costoUnitario,
      estado: "en_existencia",
      fechaEntrada: "2026-10-01",
      fechaSalida: null,
    });
    const SERIES = `GET /empresas/${E}/productos/${PRODUCTO}/series`;
    const conSeries = { ...apoyo, [PRODUCTOS]: { cuerpo: [{ ...producto, controlaSeries: true }] } };
    const SERIES_EXISTENCIA = [
      serie("s1", "IMEI-A", "590.00"),
      serie("s2", "IMEI-B", "590.00"),
      serie("s3", "IMEI-C", "650.00"),
    ];

    async function abrirVentaConProducto(manejadores: Record<string, unknown>) {
      const peticiones = simularApi({ [VENTAS]: { cuerpo: [] }, ...conSeries, ...manejadores } as never);
      const { usuario } = abrir();
      await screen.findByText(/Todavía no hay ventas/);
      await usuario.click(screen.getByRole("button", { name: "Registrar venta" }));
      const dialogo = await screen.findByRole("dialog");
      await usuario.type(within(dialogo).getByLabelText("Número del documento"), "ccf-0007");
      await waitFor(() =>
        expect(within(dialogo).getByRole("option", { name: "Tecno Plaza San Miguel" })).toBeInTheDocument(),
      );
      await usuario.selectOptions(within(dialogo).getByLabelText("Cliente"), CLIENTE);
      await waitFor(() => expect(within(dialogo).getByRole("option", { name: /CP-01/ })).toBeInTheDocument());
      await usuario.selectOptions(within(dialogo).getByLabelText("Producto 1"), PRODUCTO);
      return { peticiones, usuario, dialogo };
    }

    it("se eligen las series en existencia con su costo, la cantidad sale del conteo y se envían las elegidas", async () => {
      const { peticiones, usuario, dialogo } = await abrirVentaConProducto({
        [SERIES]: { cuerpo: SERIES_EXISTENCIA },
        [`POST /empresas/${E}/ventas`]: { estado: 201, cuerpo: detalle() },
      });
      expect(await within(dialogo).findByLabelText("IMEI-C (costo US$ 650.00)")).toBeInTheDocument();
      const consulta = peticiones.find((p) => p.ruta.endsWith("/series"))!;
      expect(Object.fromEntries(consulta.consulta)).toEqual({
        sucursalId: SUCURSAL,
        estado: "en_existencia",
      });
      expect(within(dialogo).getByLabelText("Cantidad 1")).toHaveAttribute("readonly");
      expect(within(dialogo).getByLabelText("Cantidad 1")).toHaveValue("0");

      await usuario.click(within(dialogo).getByLabelText("IMEI-C (costo US$ 650.00)"));
      await usuario.click(within(dialogo).getByLabelText("IMEI-A (costo US$ 590.00)"));
      expect(within(dialogo).getByLabelText("Cantidad 1")).toHaveValue("2");
      expect(within(dialogo).getByText("2 series elegidas")).toBeInTheDocument();
      await waitFor(() =>
        expect(within(dialogo).getByRole("option", { name: "Caja general" })).toBeInTheDocument(),
      );
      await usuario.selectOptions(within(dialogo).getByLabelText("Se cobra en"), CAJA);
      await usuario.click(within(dialogo).getByRole("button", { name: "Guardar y generar partidas" }));

      await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
      expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({
        lineas: [{ productoId: PRODUCTO, cantidad: "2.0000", series: ["IMEI-C", "IMEI-A"] }],
      });
    });

    it("una serie elegida en una línea no puede elegirse en otra línea del mismo producto", async () => {
      const { usuario, dialogo } = await abrirVentaConProducto({ [SERIES]: { cuerpo: SERIES_EXISTENCIA } });
      await usuario.click(await within(dialogo).findByLabelText("IMEI-A (costo US$ 590.00)"));
      await usuario.click(within(dialogo).getByRole("button", { name: "Agregar línea" }));
      await usuario.selectOptions(within(dialogo).getByLabelText("Producto 2"), PRODUCTO);
      const segunda = within(dialogo).getByRole("group", {
        name: "Series o IMEI vendidos (una por línea) 2",
      });
      expect(await within(segunda).findByLabelText("IMEI-A (costo US$ 590.00)")).toBeDisabled();
      expect(within(segunda).getByLabelText("IMEI-B (costo US$ 590.00)")).toBeEnabled();
    });

    it("avisa cuando no hay series en existencia y permite reintentar si falla la consulta", async () => {
      let intentos = 0;
      const { dialogo, usuario } = await abrirVentaConProducto({
        [SERIES]: () => (++intentos === 1 ? { estado: 500, cuerpo: { mensaje: "falló" } } : { cuerpo: [] }),
      });
      await usuario.click(await within(dialogo).findByRole("button", { name: "Reintentar" }));
      expect(await within(dialogo).findByText(/No hay series en existencia/)).toBeInTheDocument();
    });
  });

  it("una factura de consumidor final no pide cliente, propone el precio con IVA y admite el rango de números", async () => {
    const peticiones = simularApi({
      [VENTAS]: { cuerpo: [] },
      ...apoyo,
      [`POST /empresas/${E}/ventas`]: { estado: 201, cuerpo: detalle() },
    });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay ventas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar venta" }));
    const dialogo = await screen.findByRole("dialog");

    await usuario.selectOptions(within(dialogo).getByLabelText("Tipo de documento"), "factura");
    await usuario.type(within(dialogo).getByLabelText("Número del documento"), "fcf-00001");
    await usuario.type(within(dialogo).getByLabelText("Hasta el número"), "fcf-00015");
    await waitFor(() => expect(within(dialogo).getByRole("option", { name: /CP-01/ })).toBeInTheDocument());
    await usuario.selectOptions(within(dialogo).getByLabelText("Producto 1"), PRODUCTO);
    expect(within(dialogo).getByLabelText("Precio unitario 1")).toHaveValue("113.00");
    expect(within(dialogo).getByLabelText("Resumen del documento")).toHaveTextContent("US$ 100.00");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Caja general" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByLabelText("Se cobra en"), CAJA);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar y generar partidas" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    const cuerpo = peticiones.find((p) => p.metodo === "POST")!.cuerpo as Record<string, unknown>;
    expect(cuerpo).toMatchObject({
      tipoDocumento: "factura",
      numeroDocumento: "FCF-00001",
      numeroDocumentoHasta: "FCF-00015",
    });
    expect(cuerpo["terceroId"]).toBeUndefined();
  });

  it("un CCF sin cliente se valida antes de enviar", async () => {
    const peticiones = simularApi({ [VENTAS]: { cuerpo: [] }, ...apoyo });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay ventas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar venta" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Número del documento"), "CCF-0001");
    await waitFor(() => expect(within(dialogo).getByRole("option", { name: /CP-01/ })).toBeInTheDocument());
    await usuario.selectOptions(within(dialogo).getByLabelText("Producto 1"), PRODUCTO);
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Caja general" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByLabelText("Se cobra en"), CAJA);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar y generar partidas" }));

    expect(await within(dialogo).findByText("Un CCF necesita el cliente.")).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("muestra que no hay existencias suficientes cuando la API lo rechaza", async () => {
    simularApi({
      [VENTAS]: { cuerpo: [] },
      ...apoyo,
      [`POST /empresas/${E}/ventas`]: {
        estado: 422,
        cuerpo: { message: "Existencia insuficiente: hay 1.0000 y se piden 5.0000." },
      },
    });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay ventas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar venta" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Número del documento"), "CCF-0009");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Tecno Plaza San Miguel" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByLabelText("Cliente"), CLIENTE);
    await waitFor(() => expect(within(dialogo).getByRole("option", { name: /CP-01/ })).toBeInTheDocument());
    await usuario.selectOptions(within(dialogo).getByLabelText("Producto 1"), PRODUCTO);
    await usuario.clear(within(dialogo).getByLabelText("Cantidad 1"));
    await usuario.type(within(dialogo).getByLabelText("Cantidad 1"), "5");
    await usuario.click(within(dialogo).getByLabelText("Al crédito"));
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar y generar partidas" }));

    expect(await within(dialogo).findByText(/Existencia insuficiente/)).toBeInTheDocument();
  });

  it("el selector de cuentas solo ofrece ingresos (5xxx), no inventarios ni efectivo", async () => {
    simularApi({
      [VENTAS]: { cuerpo: [] },
      ...apoyo,
      [CATALOGO]: {
        cuerpo: [
          cuenta("110101", "Efectivo en mano"),
          cuenta("110901", "Inventario de mercadería"),
          cuenta("420101", "Gasto de papelería"),
          cuenta("510201", "Ingresos por servicios"),
        ],
      },
    });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay ventas/);
    await usuario.click(screen.getByRole("button", { name: "Registrar venta" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.selectOptions(within(dialogo).getByLabelText("Qué se vende"), "otro");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: /Ingresos por servicios/ })).toBeInTheDocument(),
    );
    expect(within(dialogo).queryByRole("option", { name: /Efectivo en mano/ })).not.toBeInTheDocument();
    expect(
      within(dialogo).queryByRole("option", { name: /Inventario de mercadería/ }),
    ).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("option", { name: /Gasto de papelería/ })).not.toBeInTheDocument();
  });
});
