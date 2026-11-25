import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type {
  CuentaTesoreriaVista,
  DocumentoComercialResumen,
  DocumentoComercialVista,
  ProductoVista,
  SucursalDetalle,
  TerceroVista,
} from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaCompras } from "./pantalla-compras";

const E = "e1";
const ADMIN: CodigoPermiso[] = ["operaciones.ver", "operaciones.registrar", "tesoreria.ver"];
const SOLO_VER: CodigoPermiso[] = ["operaciones.ver"];

const COMPRAS = `GET /empresas/${E}/compras`;
const TERCEROS = `GET /empresas/${E}/terceros`;
const PRODUCTOS = `GET /empresas/${E}/productos`;
const SUCURSALES = `GET /empresas/${E}/sucursales`;
const CUENTAS_TESORERIA = `GET /empresas/${E}/cuentas-tesoreria`;
const CATALOGO = `GET /empresas/${E}/cuentas`;
const EMPRESA = `GET /empresas/${E}`;

const resumen = (extra: Partial<DocumentoComercialResumen> = {}): DocumentoComercialResumen => ({
  id: "d1",
  operacion: "compra",
  tipoDocumento: "ccf",
  numeroDocumento: "CCF-P001",
  numeroDocumentoHasta: null,
  fecha: "2026-10-04",
  sucursalId: "33333333-3333-4333-8333-333333333333",
  tercero: {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Totalynk El Salvador",
    nit: "1234-567890-123-0",
    nrc: "123456-7",
  },
  condicionPago: "contado",
  cuentaPagoId: "44444444-4444-4444-8444-444444444444",
  diasCredito: 0,
  fechaVencimiento: null,
  totalGravado: "4720.00",
  totalExento: "0.00",
  totalNoSujeto: "0.00",
  iva: "613.60",
  ivaPercibido: "0.00",
  ivaRetenido: "0.00",
  total: "5333.60",
  totalNeto: "5333.60",
  partidaId: "p1",
  estadoPartida: "borrador",
  partidaCostoId: null,
  observaciones: null,
  ...extra,
});

const detalle = (): DocumentoComercialVista => ({
  ...resumen(),
  lineas: [
    {
      orden: 1,
      productoId: "22222222-2222-4222-8222-222222222222",
      productoCodigo: "CP-01",
      cuentaId: null,
      descripcion: "Samsung Galaxy S24",
      clase: "gravada",
      cantidad: "8.0000",
      precioUnitario: "590.0000",
      monto: "4720.00",
      costoKardex: "4720.00",
    },
  ],
});

const proveedor: TerceroVista = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Totalynk El Salvador",
  nit: "1234-567890-123-0",
  nrc: "123456-7",
  actividadEconomica: null,
  clasificacion: "otro",
  direccion: null,
  telefono: null,
  correo: null,
  esCliente: false,
  esProveedor: true,
  diasCredito: 30,
  activo: true,
};
const producto: ProductoVista = {
  id: "22222222-2222-4222-8222-222222222222",
  codigo: "CP-01",
  nombre: "Samsung Galaxy S24",
  categoriaId: null,
  categoria: null,
  unidadMedida: "unidad",
  precioVenta: "0.00",
  existenciaMinima: "0.0000",
  metodoValuacion: null,
  controlaSeries: false,
  activo: true,
};
const sucursal: SucursalDetalle = {
  id: "33333333-3333-4333-8333-333333333333",
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
const banco = {
  id: "ct1",
  tipo: "banco",
  nombre: "Banco Agrícola corriente",
  banco: "Banco Agrícola",
  numeroCuenta: "123",
  cuentaId: "44444444-4444-4444-8444-444444444444",
  cuentaCodigo: "11010301",
  cuentaNombre: "Cuenta Corriente",
  sucursalId: null,
  sucursal: null,
  activa: true,
  saldo: "0.00",
} satisfies CuentaTesoreriaVista;

const apoyo = {
  [TERCEROS]: { cuerpo: [proveedor] },
  [PRODUCTOS]: { cuerpo: [producto] },
  [SUCURSALES]: { cuerpo: [sucursal] },
  [CUENTAS_TESORERIA]: { cuerpo: [banco] },
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
  renderizar(<PantallaCompras parametros={{ empresaId: E }} />, { permisos });

describe("pantalla de compras (HU-59, S3-T62)", () => {
  it("lista las compras con su IVA, total y el estado de la partida", async () => {
    simularApi({
      [COMPRAS]: {
        cuerpo: [
          resumen(),
          resumen({
            id: "d2",
            numeroDocumento: "CCF-P002",
            condicionPago: "credito",
            fechaVencimiento: "2026-11-03",
            estadoPartida: "contabilizada",
          }),
        ],
      },
    });
    abrir();

    const fila = (await screen.findByText("CCF CCF-P001")).closest("tr")!;
    expect(within(fila).getByText("Totalynk El Salvador")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 613.60")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 5,333.60")).toBeInTheDocument();
    expect(within(fila).getByText("Borrador")).toBeInTheDocument();
    const credito = screen.getByText("CCF CCF-P002").closest("tr")!;
    expect(within(credito).getByText(/vence 03\/11\/2026/)).toBeInTheDocument();
    expect(within(credito).getByText("Contabilizada")).toBeInTheDocument();
  });

  it("sin permiso de registrar solo se consulta", async () => {
    simularApi({ [COMPRAS]: { cuerpo: [resumen()] } });
    abrir(SOLO_VER);
    await screen.findByText("CCF CCF-P001");
    expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
  });

  it("envía la búsqueda y el rango de fechas a la API", async () => {
    const peticiones = simularApi({ [COMPRAS]: { cuerpo: [] } });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay compras/);

    await usuario.type(screen.getByRole("searchbox", { name: /Buscar por número/ }), "total");
    await usuario.type(screen.getByLabelText("Desde"), "2026-10-01");

    await waitFor(() => {
      const ultima = peticiones.filter((p) => p.ruta === `/empresas/${E}/compras`).at(-1)!;
      expect(Object.fromEntries(ultima.consulta)).toEqual({ busqueda: "total", desde: "2026-10-01" });
    });
  });

  it("muestra el detalle con el costo que tomó el kardex", async () => {
    simularApi({
      [COMPRAS]: { cuerpo: [resumen()] },
      [`GET /empresas/${E}/compras/d1`]: { cuerpo: detalle() },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Ver detalle de CCF-P001" }));

    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByText("CP-01 · Samsung Galaxy S24")).toBeInTheDocument();
    expect(within(dialogo).getAllByText("US$ 4,720.00").length).toBeGreaterThanOrEqual(2);
    expect(within(dialogo).getByText(/Partida generada: Borrador/)).toBeInTheDocument();
  });

  it("registra una compra al contado: calcula el IVA y envía el documento completo", async () => {
    const peticiones = simularApi({
      [COMPRAS]: { cuerpo: [] },
      ...apoyo,
      [`POST /empresas/${E}/compras`]: { estado: 201, cuerpo: detalle() },
    });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay compras/);
    await usuario.click(screen.getByRole("button", { name: "Registrar compra" }));
    const dialogo = await screen.findByRole("dialog");

    await usuario.type(within(dialogo).getByLabelText("Número del documento"), "ccf-p001");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Totalynk El Salvador" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(
      within(dialogo).getByLabelText("Proveedor"),
      "11111111-1111-4111-8111-111111111111",
    );
    await waitFor(() => expect(within(dialogo).getByRole("option", { name: /CP-01/ })).toBeInTheDocument());
    await usuario.selectOptions(
      within(dialogo).getByLabelText("Producto 1"),
      "22222222-2222-4222-8222-222222222222",
    );
    await usuario.clear(within(dialogo).getByLabelText("Cantidad 1"));
    await usuario.type(within(dialogo).getByLabelText("Cantidad 1"), "8");
    await usuario.type(within(dialogo).getByLabelText("Precio unitario 1"), "590");

    const resumenDoc = within(dialogo).getByLabelText("Resumen del documento");
    expect(resumenDoc).toHaveTextContent("US$ 613.60");
    expect(resumenDoc).toHaveTextContent("US$ 5,333.60");

    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Banco Agrícola corriente" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(
      within(dialogo).getByLabelText("Se paga con"),
      "44444444-4444-4444-8444-444444444444",
    );
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar y generar partida" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({
      sucursalId: "33333333-3333-4333-8333-333333333333",
      tipoDocumento: "ccf",
      numeroDocumento: "CCF-P001",
      terceroId: "11111111-1111-4111-8111-111111111111",
      condicionPago: "contado",
      cuentaPagoId: "44444444-4444-4444-8444-444444444444",
      lineas: [
        {
          productoId: "22222222-2222-4222-8222-222222222222",
          cantidad: "8.0000",
          precioUnitario: "590.0000",
          clase: "gravada",
        },
      ],
    });
  });

  it("valida antes de enviar: falta número, proveedor y producto", async () => {
    const peticiones = simularApi({ [COMPRAS]: { cuerpo: [] }, ...apoyo });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay compras/);
    await usuario.click(screen.getByRole("button", { name: "Registrar compra" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar y generar partida" }));

    expect((await within(dialogo).findAllByText(/obligatorio|inválido/i)).length).toBeGreaterThan(0);
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("muestra el documento repetido que devuelve la API", async () => {
    simularApi({
      [COMPRAS]: { cuerpo: [] },
      ...apoyo,
      [`POST /empresas/${E}/compras`]: {
        estado: 409,
        cuerpo: { message: "Ya está registrado el documento CCF CCF-P001." },
      },
    });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay compras/);
    await usuario.click(screen.getByRole("button", { name: "Registrar compra" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Número del documento"), "CCF-P001");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Totalynk El Salvador" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(
      within(dialogo).getByLabelText("Proveedor"),
      "11111111-1111-4111-8111-111111111111",
    );
    await waitFor(() => expect(within(dialogo).getByRole("option", { name: /CP-01/ })).toBeInTheDocument());
    await usuario.selectOptions(
      within(dialogo).getByLabelText("Producto 1"),
      "22222222-2222-4222-8222-222222222222",
    );
    await usuario.type(within(dialogo).getByLabelText("Precio unitario 1"), "10");
    await usuario.click(within(dialogo).getByLabelText("Al crédito"));
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar y generar partida" }));

    expect(await within(dialogo).findByText(/Ya está registrado el documento/)).toBeInTheDocument();
  });

  it("el selector de cuentas no ofrece inventarios (1109) ni efectivo (1101)", async () => {
    simularApi({
      [COMPRAS]: { cuerpo: [] },
      ...apoyo,
      [CATALOGO]: {
        cuerpo: [
          cuenta("110101", "Caja general"),
          cuenta("110901", "Inventario de mercadería"),
          cuenta("120101", "Mobiliario y equipo"),
          cuenta("420101", "Gasto de papelería"),
        ],
      },
    });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay compras/);
    await usuario.click(screen.getByRole("button", { name: "Registrar compra" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.selectOptions(within(dialogo).getByLabelText("Destino"), "otro");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: /Gasto de papelería/ })).toBeInTheDocument(),
    );
    expect(within(dialogo).getByRole("option", { name: /Mobiliario y equipo/ })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("option", { name: /Caja general/ })).not.toBeInTheDocument();
    expect(
      within(dialogo).queryByRole("option", { name: /Inventario de mercadería/ }),
    ).not.toBeInTheDocument();
  });
});
