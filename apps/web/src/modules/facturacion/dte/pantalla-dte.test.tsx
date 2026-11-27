import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { simularApi, type RespuestaSimulada } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import {
  APOYO,
  CAJA,
  CLIENTE,
  E,
  INGRESO,
  PRODUCTO,
  RUTAS,
  SIN_NRC,
  SUCURSAL,
  VENTA,
  disponibleCcf,
  resumenDte,
  ventaCcf,
  vistaDte,
} from "./datos-prueba";
import { PantallaDte } from "./pantalla-dte";

const EMITIR: CodigoPermiso[] = ["dte.ver", "dte.emitir", "tesoreria.ver"];
const VER: CodigoPermiso[] = ["dte.ver"];

const FACTURA = resumenDte({
  id: "dte-factura",
  tipoDte: "01",
  nombreTipo: "Factura",
  numeroControl: "DTE-01-M001P001-000000000000007",
  receptor: null,
  total: "226.00",
  iva: "26.00",
  documentoId: "venta-factura",
});
const NOTA = resumenDte({
  id: "dte-nota",
  tipoDte: "05",
  nombreTipo: "Nota de crédito",
  numeroControl: "DTE-05-M001P001-000000000000001",
  total: "282.50",
  iva: "32.50",
  documentoId: null,
  notaId: "n1",
  relacionado: {
    id: "dte-ccf",
    numeroControl: "DTE-03-M001P001-000000000000001",
    codigoGeneracion: resumenDte().codigoGeneracion,
  },
});

const abrir = (permisos: CodigoPermiso[] = EMITIR) =>
  renderizar(<PantallaDte parametros={{ empresaId: E }} />, { permisos });

afterEach(() => window.history.replaceState(null, "", "/"));

describe("lista de documentos electrónicos", () => {
  it("muestra cada DTE con su tipo, número de control, receptor, montos y estado", async () => {
    simularApi({
      [RUTAS.dtes]: {
        cuerpo: [
          FACTURA,
          resumenDte(),
          NOTA,
          resumenDte({
            id: "dte-inv",
            estado: "invalidado",
            numeroControl: "DTE-03-M001P001-000000000000002",
          }),
        ],
      },
    });
    abrir();

    const tabla = await screen.findByRole("table", { name: "Documentos tributarios electrónicos" });
    const fila = (texto: string) => within(tabla).getByText(texto).closest("tr")!;
    expect(within(fila("DTE-01-M001P001-000000000000007")).getByText("Consumidor final")).toBeInTheDocument();
    expect(within(fila("DTE-01-M001P001-000000000000007")).getByText("US$ 226.00")).toBeInTheDocument();
    expect(within(fila("DTE-03-M001P001-000000000000001")).getByText("CCF")).toBeInTheDocument();
    expect(
      within(fila("DTE-05-M001P001-000000000000001")).getByText("Corrige DTE-03-M001P001-000000000000001"),
    ).toBeInTheDocument();
    expect(within(fila("DTE-03-M001P001-000000000000002")).getByText("Invalidado")).toBeInTheDocument();
    expect(
      within(fila("DTE-01-M001P001-000000000000007")).getByRole("link", {
        name: "DTE-01-M001P001-000000000000007",
      }),
    ).toHaveAttribute("href", `/empresas/${E}/dte/dte-factura`);
  });

  it("envía los filtros de tipo, estado y búsqueda a la API", async () => {
    const peticiones = simularApi({ [RUTAS.dtes]: { cuerpo: [] } });
    const { usuario } = abrir();
    await screen.findByText("Todavía no se ha emitido ningún DTE.");

    await usuario.selectOptions(screen.getByRole("combobox", { name: "Tipo de documento" }), "05");
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "invalidado");
    await usuario.type(screen.getByRole("searchbox"), "tecno");
    await waitFor(() => {
      const consulta = peticiones.filter((p) => p.ruta === `/empresas/${E}/dte`).at(-1)!.consulta;
      expect(Object.fromEntries(consulta)).toEqual({ tipo: "05", estado: "invalidado", busqueda: "tecno" });
    });
    expect(await screen.findByText("Ningún documento coincide con los filtros.")).toBeInTheDocument();
  });

  it("sin dte.emitir solo se consulta", async () => {
    simularApi({ [RUTAS.dtes]: { cuerpo: [FACTURA] } });
    abrir(VER);
    await screen.findByText("DTE-01-M001P001-000000000000007");
    expect(screen.queryByRole("button", { name: "Emitir factura" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Emitir CCF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Emitir nota" })).not.toBeInTheDocument();
  });

  it("sin dte.ver no consulta la API", async () => {
    const peticiones = simularApi({});
    abrir([]);
    expect(
      await screen.findByText("No tienes permiso para ver los documentos electrónicos."),
    ).toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta.endsWith("/dte"))).toBe(false);
  });

  it("si falla la carga ofrece reintentar", async () => {
    simularApi({ [RUTAS.dtes]: { estado: 500, cuerpo: { message: "Servicio no disponible." } } });
    abrir();
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("emisión de la factura electrónica (S4-T05)", () => {
  it("emite a consumidor final con el precio con IVA y abre el visor del DTE emitido", async () => {
    const peticiones = simularApi({
      ...APOYO,
      [RUTAS.dtes]: { cuerpo: [] },
      [RUTAS.venta]: { estado: 201, cuerpo: vistaDte({ ...FACTURA }) },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir factura" }));
    const dialogo = await screen.findByRole("dialog", { name: "Emitir factura electrónica" });

    // El número y la fecha no se piden: los asigna la API
    expect(within(dialogo).queryByLabelText(/Número del documento/)).not.toBeInTheDocument();
    expect(
      within(dialogo).getByText(/El número de control y la fecha de emisión los asigna el sistema/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "CP-01 · Samsung Galaxy A15" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Producto 1" }), PRODUCTO);
    // El precio sugerido de la factura incluye el IVA (250.00 × 1.13)
    expect(within(dialogo).getByRole("textbox", { name: "Precio con IVA 1" })).toHaveValue("282.50");
    await usuario.clear(within(dialogo).getByRole("textbox", { name: "Cantidad 1" }));
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Cantidad 1" }), "2");
    await usuario.clear(within(dialogo).getByRole("textbox", { name: "Precio con IVA 1" }));
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Precio con IVA 1" }), "113");
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Se cobra en" }), CAJA);

    expect(
      within(within(dialogo).getByLabelText("Resumen del documento")).getByText("US$ 226.00"),
    ).toBeInTheDocument();
    expect(
      within(dialogo).getByText("En una factura de consumidor final el precio ya incluye el IVA."),
    ).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole("button", { name: "Emitir y firmar" }));
    await waitFor(() => expect(window.location.pathname).toBe(`/empresas/${E}/dte/dte-factura`));
    const envio = peticiones.find((p) => p.metodo === "POST" && p.ruta === `/empresas/${E}/dte/ventas`)!;
    expect(envio.cuerpo).toEqual({
      tipoDocumento: "factura",
      sucursalId: SUCURSAL,
      condicionPago: "contado",
      cuentaPagoId: CAJA,
      lineas: [{ productoId: PRODUCTO, cantidad: "2.0000", precioUnitario: "113.0000", clase: "gravada" }],
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("un servicio se factura con su cuenta de ingreso y su descripción", async () => {
    const peticiones = simularApi({
      ...APOYO,
      [RUTAS.dtes]: { cuerpo: [] },
      [RUTAS.venta]: { estado: 201, cuerpo: vistaDte({ ...FACTURA }) },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir factura" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Qué se vende" }), "otro");
    await waitFor(() =>
      expect(
        within(dialogo).getByRole("option", { name: "510201 · Ingresos por servicios técnicos" }),
      ).toBeInTheDocument(),
    );
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Cuenta de ingreso 1" }),
      INGRESO,
    );
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Descripción 1" }), "Cambio de pantalla");
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Precio con IVA 1" }), "45.20");
    await usuario.click(within(dialogo).getByRole("radio", { name: "Al crédito" }));
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Cliente" }), CLIENTE);
    await usuario.click(within(dialogo).getByRole("button", { name: "Emitir y firmar" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "POST")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "POST")!.cuerpo).toMatchObject({
      tipoDocumento: "factura",
      terceroId: CLIENTE,
      condicionPago: "credito",
      lineas: [
        {
          cuentaId: INGRESO,
          descripcion: "Cambio de pantalla",
          cantidad: "1.0000",
          precioUnitario: "45.2000",
        },
      ],
    });
  });

  it("valida antes de enviar: no emite una línea incompleta", async () => {
    const peticiones = simularApi({ ...APOYO, [RUTAS.dtes]: { cuerpo: [] } });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir factura" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Emitir y firmar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/inválido|Elige/);
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("muestra el rechazo de la API y deja el formulario abierto", async () => {
    simularApi({
      ...APOYO,
      [RUTAS.dtes]: { cuerpo: [] },
      [RUTAS.venta]: { estado: 422, cuerpo: { message: "La empresa no tiene NRC: no puede emitir DTE." } },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir factura" }));
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "CP-01 · Samsung Galaxy A15" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Producto 1" }), PRODUCTO);
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Se cobra en" }), CAJA);
    await usuario.click(within(dialogo).getByRole("button", { name: "Emitir y firmar" }));

    expect(
      await within(dialogo).findByText("La empresa no tiene NRC: no puede emitir DTE."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("emisión del CCF electrónico (S4-T08)", () => {
  it("exige el cliente y propone el precio sin IVA", async () => {
    const peticiones = simularApi({ ...APOYO, [RUTAS.dtes]: { cuerpo: [] } });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir CCF" }));
    const dialogo = await screen.findByRole("dialog", { name: "Emitir comprobante de crédito fiscal" });
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "CP-01 · Samsung Galaxy A15" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Producto 1" }), PRODUCTO);
    expect(within(dialogo).getByRole("textbox", { name: "Precio sin IVA 1" })).toHaveValue("250.00");
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Se cobra en" }), CAJA);
    await usuario.click(within(dialogo).getByRole("button", { name: "Emitir y firmar" }));

    expect(await within(dialogo).findByText("Un CCF necesita el cliente.")).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("calcula el IVA aparte y emite con el cliente contribuyente", async () => {
    const peticiones = simularApi({
      ...APOYO,
      [RUTAS.dtes]: { cuerpo: [] },
      [RUTAS.venta]: { estado: 201, cuerpo: vistaDte() },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir CCF" }));
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Juan Pérez" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Cliente (contribuyente)" }),
      CLIENTE,
    );
    expect(within(dialogo).getByText("NIT 1234-567890-123-0 · NRC 245871-4")).toBeInTheDocument();
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Producto 1" }), PRODUCTO);
    await usuario.clear(within(dialogo).getByRole("textbox", { name: "Cantidad 1" }));
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Cantidad 1" }), "2");
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Se cobra en" }), CAJA);

    const resumen = within(within(dialogo).getByLabelText("Resumen del documento"));
    expect(resumen.getByText("US$ 500.00")).toBeInTheDocument();
    expect(resumen.getByText("US$ 65.00")).toBeInTheDocument();
    expect(resumen.getByText("US$ 565.00")).toBeInTheDocument();
    expect(within(dialogo).queryByText(/el precio ya incluye el IVA/)).not.toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole("button", { name: "Emitir y firmar" }));
    await waitFor(() => expect(window.location.pathname).toBe(`/empresas/${E}/dte/dte-ccf`));
    expect(peticiones.find((p) => p.metodo === "POST")!.cuerpo).toEqual({
      tipoDocumento: "ccf",
      sucursalId: SUCURSAL,
      terceroId: CLIENTE,
      condicionPago: "contado",
      cuentaPagoId: CAJA,
      lineas: [{ productoId: PRODUCTO, cantidad: "2.0000", precioUnitario: "250.0000", clase: "gravada" }],
    });
  });

  it("avisa y no deja emitir a un cliente sin NRC", async () => {
    simularApi({ ...APOYO, [RUTAS.dtes]: { cuerpo: [] } });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir CCF" }));
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Juan Pérez" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Cliente (contribuyente)" }),
      SIN_NRC,
    );

    expect(within(dialogo).getByText(/Este cliente no tiene NRC: un CCF lo exige/)).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Emitir y firmar" })).toBeDisabled();
  });
});

describe("emisión de notas de crédito y débito electrónicas (S4-T11)", () => {
  const conNotas = (extra: Record<string, RespuestaSimulada> = {}) => ({
    ...APOYO,
    [RUTAS.dtes]: (p: { consulta: URLSearchParams }) => ({
      cuerpo: p.consulta.get("tipo") === "03" ? [resumenDte()] : [],
    }),
    [`GET /empresas/${E}/ventas/${VENTA}`]: { cuerpo: ventaCcf },
    [`GET /empresas/${E}/notas-comerciales/disponible/venta/${VENTA}`]: { cuerpo: disponibleCcf },
    ...extra,
  });

  it("solo ofrece los CCF electrónicos vigentes", async () => {
    const peticiones = simularApi(conNotas());
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir nota" }));
    const dialogo = await screen.findByRole("dialog", { name: "Emitir nota electrónica" });

    await waitFor(() =>
      expect(
        within(dialogo).getByRole("option", { name: /DTE-03-M001P001-000000000000001 · Tecno Plaza/ }),
      ).toBeInTheDocument(),
    );
    const consulta = peticiones.find((p) => p.consulta.get("tipo") === "03")!.consulta;
    expect(Object.fromEntries(consulta)).toEqual({ tipo: "03", estado: "procesado" });
  });

  it("una devolución emite la nota de crédito con las unidades que regresan y ajusta el IVA", async () => {
    const peticiones = simularApi(conNotas({ [RUTAS.nota]: { estado: 201, cuerpo: vistaDte({ ...NOTA }) } }));
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir nota" }));
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialogo).getAllByRole("option")).toHaveLength(2));
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "CCF que se corrige" }),
      "dte-ccf",
    );

    expect(within(dialogo).getByText("Nota de crédito")).toBeInTheDocument();
    await usuario.type(await within(dialogo).findByRole("textbox", { name: "Unidades a devolver 1" }), "1");
    // Fue al contado: el reembolso sale de caja
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: /Caja o banco del reembolso/ }),
      CAJA,
    );
    const resumen = within(within(dialogo).getByLabelText("Total de la nota"));
    expect(resumen.getByText("US$ 250.00")).toBeInTheDocument();
    expect(resumen.getByText("US$ 32.50")).toBeInTheDocument();
    expect(resumen.getByText("US$ 282.50")).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole("button", { name: "Emitir y firmar" }));
    await waitFor(() => expect(window.location.pathname).toBe(`/empresas/${E}/dte/dte-nota`));
    expect(peticiones.find((p) => p.metodo === "POST")!.cuerpo).toEqual({
      documentoId: VENTA,
      tipo: "credito",
      motivo: "devolucion",
      cuentaPagoId: CAJA,
      lineas: [{ lineaOrden: 1, cantidad: "1.0000", clase: "gravada" }],
    });
  });

  it("un cargo adicional emite la nota de débito con su cuenta e importe", async () => {
    const peticiones = simularApi(
      conNotas({
        [`GET /empresas/${E}/cuentas`]: {
          cuerpo: [
            { ...APOYO[`GET /empresas/${E}/cuentas`].cuerpo[0]!, codigo: "5103", nombre: "Otros ingresos" },
          ],
        },
        [RUTAS.nota]: { estado: 201, cuerpo: vistaDte({ ...NOTA, id: "dte-nd", tipoDte: "06" }) },
      }),
    );
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir nota" }));
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialogo).getAllByRole("option")).toHaveLength(2));
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "CCF que se corrige" }),
      "dte-ccf",
    );
    await usuario.click(within(dialogo).getByRole("radio", { name: "Cargo adicional" }));

    expect(within(dialogo).getByText("Nota de débito")).toBeInTheDocument();
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Cuenta del cargo 1" }),
      INGRESO,
    );
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Descripción 1" }), "Flete de entrega");
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Importe sin IVA 1" }), "20");
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: /Caja o banco/ }), CAJA);
    await usuario.click(within(dialogo).getByRole("button", { name: "Emitir y firmar" }));

    await waitFor(() => expect(window.location.pathname).toBe(`/empresas/${E}/dte/dte-nd`));
    expect(peticiones.find((p) => p.metodo === "POST")!.cuerpo).toEqual({
      documentoId: VENTA,
      tipo: "debito",
      motivo: "cargo",
      cuentaPagoId: CAJA,
      lineas: [{ cuentaId: INGRESO, descripcion: "Flete de entrega", monto: "20.00", clase: "gravada" }],
    });
  });

  it("no envía una devolución sin unidades", async () => {
    const peticiones = simularApi(conNotas());
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Emitir nota" }));
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialogo).getAllByRole("option")).toHaveLength(2));
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "CCF que se corrige" }),
      "dte-ccf",
    );
    await within(dialogo).findByRole("textbox", { name: "Unidades a devolver 1" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Emitir y firmar" }));

    expect(await within(dialogo).findByRole("alert")).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });
});
