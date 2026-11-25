import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type {
  ProductoReabastecimientoVista,
  ProductoVista,
  InventarioAnaliticoVista,
  SerieInventarioVista,
  SucursalDetalle,
  TomaFisicaVista,
} from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaSeries } from "./pantalla-series";

const E = "e1";
const P1 = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222221";
const S2 = "22222222-2222-4222-8222-222222222222";
const TOMA_ID = "44444444-4444-4444-8444-444444444444";
const CUENTA_SOBRANTES = "55555555-5555-4555-8555-555555555555";
const VER: CodigoPermiso[] = ["inventario.ver"];
const CONTAR: CodigoPermiso[] = ["inventario.ver", "inventario.contar"];
const APROBAR: CodigoPermiso[] = ["inventario.ver", "inventario.contar", "inventario.aprobar_ajuste"];
const producto = (id: string, controlaSeries: boolean): ProductoVista => ({
  id,
  codigo: controlaSeries ? "CEL-001" : "CAR-001",
  nombre: controlaSeries ? "Teléfono" : "Cargador",
  categoriaId: null,
  categoria: null,
  unidadMedida: "unidad",
  precioVenta: "0.00",
  existenciaMinima: "0.0000",
  metodoValuacion: null,
  controlaSeries,
  activo: true,
});
const sucursal = (id: string, nombre: string, esMatriz = false): SucursalDetalle => ({
  id,
  empresaId: E,
  nombre,
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz,
  activa: true,
  creadoEn: "2026-11-10T00:00:00.000Z",
  actualizadoEn: "2026-11-10T00:00:00.000Z",
});
const PRODUCTOS = `GET /empresas/${E}/productos`;
const SUCURSALES = `GET /empresas/${E}/sucursales`;
const SERIES = `GET /empresas/${E}/productos/${P1}/series`;
const REABASTECIMIENTO = `GET /empresas/${E}/productos/reabastecimiento`;
const TOMA_FISICA = `GET /empresas/${E}/tomas-fisicas`;
const CUENTAS = `GET /empresas/${E}/cuentas`;
const ANALITICO = `GET /empresas/${E}/inventario-analitico`;
async function ABRIR() {
  const renderizado = renderizar(<PantallaSeries parametros={{ empresaId: E }} />, { permisos: VER });
  await renderizado.usuario.click(screen.getByRole("tab", { name: "Series e IMEI" }));
  return renderizado;
}

const SERIE: SerieInventarioVista = {
  id: "33333333-3333-4333-8333-333333333331",
  productoId: P1,
  sucursalId: S1,
  numeroSerie: "IMEI-A",
  costoUnitario: "1234.50",
  estado: "en_existencia",
  fechaEntrada: "2026-10-01",
  fechaSalida: null,
};

const POR_REABASTECER: ProductoReabastecimientoVista = {
  productoId: P1,
  codigo: "CEL-001",
  nombre: "Teléfono",
  unidadMedida: "unidad",
  sucursalId: S1,
  existenciaActual: "0.0000",
  existenciaMinima: "5.0000",
  cantidadFaltante: "5.0000",
};

const REPORTE_ANALITICO: InventarioAnaliticoVista = {
  desde: "2026-10-01",
  hasta: "2026-10-31",
  sucursalId: null,
  inventarioInicial: "0.00",
  compras: "40000.00",
  gastosSobreCompras: "1000.00",
  devolucionesYRebajas: "1000.00",
  comprasNetas: "40000.00",
  inventarioFinal: "5888.00",
  costoVentas: "34112.00",
  inventarioFinalPorSucursal: [
    { sucursalId: S1, sucursal: "Casa matriz", fechaToma: "2026-10-31", valor: "5888.00" },
  ],
};

function api(
  series: unknown = [SERIE],
  productos: ProductoVista[] = [producto(P1, true)],
  reabastecimiento: ProductoReabastecimientoVista[] = [],
) {
  return simularApi({
    [PRODUCTOS]: { cuerpo: productos },
    [SUCURSALES]: { cuerpo: [sucursal(S2, "Usulután"), sucursal(S1, "Casa matriz", true)] },
    [SERIES]: { cuerpo: series },
    [REABASTECIMIENTO]: { cuerpo: reabastecimiento },
    [TOMA_FISICA]: { cuerpo: null },
  });
}

function tomaFisica(
  detalleCambios: Partial<TomaFisicaVista["detalles"][number]> = {},
  estado: TomaFisicaVista["estado"] = "en_conteo",
): TomaFisicaVista {
  return {
    id: TOMA_ID,
    sucursalId: S1,
    fecha: "2026-02-10",
    estado,
    partidaId: estado === "aprobada" ? "66666666-6666-4666-8666-666666666666" : null,
    creadoEn: "2026-02-10T12:00:00.000Z",
    aprobadoEn: estado === "aprobada" ? "2026-02-10T13:00:00.000Z" : null,
    detalles: [
      {
        productoId: P1,
        codigo: "CAR-001",
        nombre: "Cargador",
        unidadMedida: "unidad",
        controlaSeries: false,
        existenciaSistema: "2.0000",
        cantidadContada: null,
        diferencia: null,
        cantidadFaltante: null,
        cantidadSobrante: null,
        seriesContadas: [],
        valorFaltante: null,
        valorSobrante: null,
        valorFinal: null,
        ...detalleCambios,
      },
    ],
    resumen: {
      productosConDiferencia: 0,
      cantidadFaltante: "0.0000",
      cantidadSobrante: "0.0000",
      valorFaltante: "0.00",
      valorSobrante: estado === "aprobada" ? "0.00" : null,
    },
  };
}

describe("pestaña Series e IMEI (HU-66, S3-T83)", () => {
  it("muestra pestañas, producto seriado, costo, estado y fechas", async () => {
    api();
    const { usuario } = await ABRIR();

    expect(await screen.findByRole("tab", { name: "Series e IMEI" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Conteo físico" })).toBeEnabled();
    await screen.findByRole("option", { name: /CEL-001/ });
    await usuario.selectOptions(screen.getByLabelText("Producto"), P1);

    const tabla = await screen.findByRole("table", { name: "Series e IMEI" });
    const fila = within(tabla).getByRole("row", { name: /IMEI-A/ });
    expect(within(fila).getByText("US$ 1,234.50")).toBeInTheDocument();
    expect(within(fila).getByText("En existencia")).toBeInTheDocument();
    expect(within(fila).getByText("01/10/2026")).toBeInTheDocument();
    expect(screen.getByText("1 en existencia")).toBeInTheDocument();
  });

  it("filtra por sucursal y estado y vuelve a consultar con parámetros exactos", async () => {
    const peticiones = api([]);
    const { usuario } = await ABRIR();
    await screen.findByRole("option", { name: /CEL-001/ });
    await usuario.selectOptions(screen.getByLabelText("Producto"), P1);
    await screen.findByRole("table", { name: "Series e IMEI" });
    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S2);
    await usuario.selectOptions(screen.getByLabelText("Estado"), "vendidas");

    await waitFor(() => {
      const consulta = peticiones.filter((p) => p.ruta.endsWith("/series")).at(-1)?.consulta;
      expect(Object.fromEntries(consulta ?? [])).toEqual({ sucursalId: S2, estado: "vendidas" });
    });
  });

  it("muestra estado vacío y productos sin control por serie", async () => {
    api([], [producto(P1, false)]);
    await ABRIR();
    expect(
      await screen.findByText("No hay productos configurados para controlar series."),
    ).toBeInTheDocument();
  });

  it("permite reintentar un error de consulta", async () => {
    let intentos = 0;
    simularApi({
      [PRODUCTOS]: { cuerpo: [producto(P1, true)] },
      [SUCURSALES]: { cuerpo: [sucursal(S1, "Casa matriz", true)] },
      [SERIES]: () =>
        ++intentos === 1 ? { estado: 500, cuerpo: { message: "Fallo temporal" } } : { cuerpo: [SERIE] },
    });
    const { usuario } = await ABRIR();
    await screen.findByRole("option", { name: /CEL-001/ });
    await usuario.selectOptions(screen.getByLabelText("Producto"), P1);
    expect(await screen.findByText(/No se pudieron cargar las series/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("row", { name: /IMEI-A/ })).toBeInTheDocument();
  });

  it("no consulta cuando falta el permiso", async () => {
    const peticiones = simularApi({});
    renderizar(<PantallaSeries parametros={{ empresaId: E }} />);
    expect(
      await screen.findByText("Tu rol no permite consultar el inventario en esta empresa."),
    ).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("muestra el indicador y la cantidad sugerida al llegar al punto de reorden", async () => {
    const peticiones = api([SERIE], [producto(P1, true)], [POR_REABASTECER]);
    const { usuario } = await ABRIR();
    await usuario.click(screen.getByRole("tab", { name: "Reabastecimiento" }));

    expect(await screen.findByText("1 producto por reabastecer")).toBeInTheDocument();
    const tabla = await screen.findByRole("table", { name: "Productos por reabastecer" });
    const fila = within(tabla).getByRole("row", { name: /CEL-001/ });
    expect(within(fila).getAllByText("5 unidad")).toHaveLength(2);
    expect(peticiones.find((p) => p.ruta.endsWith("/productos/reabastecimiento"))?.consulta).toEqual(
      new URLSearchParams({ sucursalId: S1 }),
    );
  });

  it("muestra vacío y permite reintentar si falla la consulta de reabastecimiento", async () => {
    let intentos = 0;
    simularApi({
      [PRODUCTOS]: { cuerpo: [producto(P1, true)] },
      [SUCURSALES]: { cuerpo: [sucursal(S1, "Casa matriz", true)] },
      [REABASTECIMIENTO]: () =>
        ++intentos === 1 ? { estado: 500, cuerpo: { message: "Fallo temporal" } } : { cuerpo: [] },
    });
    const { usuario } = await ABRIR();
    await usuario.click(screen.getByRole("tab", { name: "Reabastecimiento" }));
    expect(await screen.findByText(/No se pudo consultar el punto de reorden/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByText("No hay productos que requieran reabastecimiento en esta sucursal."),
    ).toBeInTheDocument();
  });
});

describe("pestaña Conteo físico (HU-68, S3-T89)", () => {
  it("inicia el conteo con sucursal y fecha exactas", async () => {
    const iniciada = tomaFisica();
    const peticiones = simularApi({
      [PRODUCTOS]: { cuerpo: [producto(P1, false)] },
      [SUCURSALES]: { cuerpo: [sucursal(S1, "Casa matriz", true)] },
      [TOMA_FISICA]: { cuerpo: null },
      [`POST /empresas/${E}/tomas-fisicas`]: { cuerpo: iniciada },
    });
    const { usuario } = renderizar(<PantallaSeries parametros={{ empresaId: E }} />, { permisos: CONTAR });
    await screen.findByText("No hay una toma física para esta sucursal.");
    fireEvent.change(screen.getByLabelText("Fecha del conteo"), { target: { value: "2026-02-10" } });
    await usuario.click(screen.getByRole("button", { name: "Iniciar conteo" }));

    await screen.findByText("Toma física al 10/02/2026");
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
      sucursalId: S1,
      fecha: "2026-02-10",
    });
  });

  it("guarda cantidades y envía costo y cuentas elegidas al aprobar", async () => {
    const abierta = tomaFisica();
    const guardada: TomaFisicaVista = {
      ...abierta,
      detalles: [
        {
          ...abierta.detalles[0]!,
          cantidadContada: "3.0000",
          diferencia: "1.0000",
          cantidadFaltante: "0.0000",
          cantidadSobrante: "1.0000",
          valorFaltante: "0.00",
          valorSobrante: null,
        },
      ],
      resumen: {
        productosConDiferencia: 1,
        cantidadFaltante: "0.0000",
        cantidadSobrante: "1.0000",
        valorFaltante: "0.00",
        valorSobrante: null,
      },
    };
    const aprobada: TomaFisicaVista = {
      ...guardada,
      estado: "aprobada",
      partidaId: "66666666-6666-4666-8666-666666666666",
      aprobadoEn: "2026-02-10T13:00:00.000Z",
      detalles: [
        {
          ...guardada.detalles[0]!,
          valorSobrante: "5.50",
          valorFinal: "5.50",
        },
      ],
      resumen: { ...guardada.resumen, valorSobrante: "5.50" },
    };
    const peticiones = simularApi({
      [PRODUCTOS]: { cuerpo: [producto(P1, false)] },
      [SUCURSALES]: { cuerpo: [sucursal(S1, "Casa matriz", true)] },
      [TOMA_FISICA]: { cuerpo: abierta },
      [CUENTAS]: {
        cuerpo: [
          {
            id: CUENTA_SOBRANTES,
            codigo: "5203",
            nombre: "Otros ingresos",
            nivel: 4,
            naturaleza: "acreedora",
            tipo: "ingresos",
            cuentaPadreId: null,
            activa: true,
            imputable: true,
          },
        ],
      },
      [`PATCH /empresas/${E}/tomas-fisicas/${TOMA_ID}/conteo`]: { cuerpo: guardada },
      [`POST /empresas/${E}/tomas-fisicas/${TOMA_ID}/aprobar`]: { cuerpo: aprobada },
    });
    const { usuario } = renderizar(<PantallaSeries parametros={{ empresaId: E }} />, { permisos: APROBAR });
    const contado = await screen.findByLabelText("Contado: Cargador");
    await usuario.type(contado, "3");
    await usuario.click(screen.getByRole("button", { name: "Guardar conteo" }));
    await screen.findByText("Costo al aprobar");
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({
      lineas: [{ productoId: P1, cantidadContada: "3" }],
    });

    await usuario.selectOptions(
      screen.getByLabelText("Cuenta contra inventario para sobrantes"),
      CUENTA_SOBRANTES,
    );
    await usuario.type(screen.getByLabelText("Costo por unidad sobrante de CAR-001"), "5.50");
    await usuario.click(screen.getByRole("button", { name: "Generar ajuste" }));
    await screen.findByText(/Partida en borrador/);
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
      cuentaSobrantesId: CUENTA_SOBRANTES,
      costosSobrantes: [{ productoId: P1, costoUnitario: "5.50" }],
    });
  });
});

describe("pestaña Sistema analítico (HU-69, S3-T92)", () => {
  it("muestra el costo de ventas y consulta por fecha y sucursal", async () => {
    const peticiones = simularApi({
      [PRODUCTOS]: { cuerpo: [producto(P1, false)] },
      [SUCURSALES]: { cuerpo: [sucursal(S2, "Usulután"), sucursal(S1, "Casa matriz", true)] },
      [TOMA_FISICA]: { cuerpo: null },
      [ANALITICO]: { cuerpo: REPORTE_ANALITICO },
    });
    const { usuario } = renderizar(<PantallaSeries parametros={{ empresaId: E }} />, { permisos: VER });
    await usuario.click(screen.getByRole("tab", { name: "Sistema analítico" }));

    const tabla = await screen.findByRole("table", { name: "Costo de ventas al cierre" });
    expect(screen.getByText("US$ 34,112.00")).toBeInTheDocument();
    expect(screen.getAllByText("US$ 5,888.00")).toHaveLength(2);
    expect(within(tabla).getByRole("row", { name: /Casa matriz/ })).toHaveTextContent("31/10/2026");

    const desde = screen.getByLabelText("Desde") as HTMLInputElement;
    const hasta = screen.getByLabelText("Hasta") as HTMLInputElement;
    const inicial = peticiones.find((p) => p.ruta.endsWith("/inventario-analitico"));
    expect(Object.fromEntries(inicial?.consulta ?? [])).toEqual({
      desde: desde.value,
      hasta: hasta.value,
    });

    await usuario.selectOptions(screen.getByLabelText("Sucursal"), S2);
    await waitFor(() => {
      const ultima = peticiones.filter((p) => p.ruta.endsWith("/inventario-analitico")).at(-1);
      expect(Object.fromEntries(ultima?.consulta ?? [])).toEqual({
        desde: desde.value,
        hasta: hasta.value,
        sucursalId: S2,
      });
    });
  });

  it("deja pendiente el costo cuando falta una toma física aprobada", async () => {
    simularApi({
      [PRODUCTOS]: { cuerpo: [producto(P1, false)] },
      [SUCURSALES]: { cuerpo: [sucursal(S1, "Casa matriz", true)] },
      [TOMA_FISICA]: { cuerpo: null },
      [ANALITICO]: {
        cuerpo: {
          ...REPORTE_ANALITICO,
          inventarioFinal: null,
          costoVentas: null,
          inventarioFinalPorSucursal: [
            { sucursalId: S1, sucursal: "Casa matriz", fechaToma: null, valor: null },
          ],
        },
      },
    });
    const { usuario } = renderizar(<PantallaSeries parametros={{ empresaId: E }} />, { permisos: VER });
    await usuario.click(screen.getByRole("tab", { name: "Sistema analítico" }));

    expect(await screen.findByText("Sin toma aprobada hasta la fecha final.")).toBeInTheDocument();
    const avisos = screen.getAllByText("Aprueba una toma física para calcular el costo de ventas.");
    expect(avisos.length).toBeGreaterThan(0);
  });
});
