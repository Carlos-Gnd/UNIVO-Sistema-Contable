import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import {
  Dinero,
  type CajaChicaVista,
  type CuentaTesoreriaVista,
  type SucursalDetalle,
} from "@contable/shared";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaCajaChica } from "./pantalla-caja-chica";

const E = "00000000-0000-4000-8000-000000000001";
const S = "00000000-0000-4000-8000-000000000002";
const CAJA_ID = "00000000-0000-4000-8000-000000000003";
const CUENTA_CHICA = "00000000-0000-4000-8000-000000000004";
const CUENTA_ORIGEN = "00000000-0000-4000-8000-000000000005";
const CUENTA_GASTO = "00000000-0000-4000-8000-000000000006";
const VALE_ID = "00000000-0000-4000-8000-000000000007";
const PERMISOS: CodigoPermiso[] = ["tesoreria.ver", "tesoreria.registrar"];
const CAJAS = `GET /empresas/${E}/cajas-chicas`;
const SUCURSALES = `GET /empresas/${E}/sucursales`;
const TESORERIA = `GET /empresas/${E}/cuentas-tesoreria`;
const CATALOGO = `GET /empresas/${E}/cuentas`;
const CAJA_CHICA: CuentaTesoreriaVista = {
  id: CUENTA_CHICA,
  tipo: "caja",
  nombre: "Caja chica matriz",
  banco: null,
  numeroCuenta: null,
  cuentaId: "00000000-0000-4000-8000-000000000008",
  cuentaCodigo: "11010201",
  cuentaNombre: "Caja chica matriz",
  sucursalId: S,
  sucursal: "Casa matriz",
  activa: true,
  saldo: "200.00",
};
const ORIGEN: CuentaTesoreriaVista = {
  ...CAJA_CHICA,
  id: CUENTA_ORIGEN,
  nombre: "Caja general",
  cuentaId: "00000000-0000-4000-8000-000000000009",
  cuentaCodigo: "110101",
  cuentaNombre: "Caja general",
  saldo: "500.00",
};
const SUCURSAL: SucursalDetalle = {
  id: S,
  empresaId: E,
  nombre: "Casa matriz",
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz: true,
  activa: true,
  creadoEn: "2026-11-10T00:00:00.000Z",
  actualizadoEn: "2026-11-10T00:00:00.000Z",
};
const GASTO: CuentaCatalogo = {
  id: CUENTA_GASTO,
  codigo: "520101",
  nombre: "Papelería y útiles",
  nivel: 4,
  naturaleza: "deudora",
  tipo: "costos_gastos",
  cuentaPadreId: null,
  activa: true,
  imputable: true,
};

function cajaChica(vales: CajaChicaVista["vales"] = []): CajaChicaVista {
  const totalVales = Dinero.sumar(vales.map((vale) => vale.total)).aTexto();
  const valesPorReintegrar = Dinero.sumar(
    vales.filter((vale) => vale.estado === "por_reintegrar").map((vale) => vale.total),
  ).aTexto();
  return {
    id: CAJA_ID,
    sucursalId: S,
    sucursal: "Casa matriz",
    cuentaTesoreriaId: CUENTA_CHICA,
    cuentaCodigo: "11010201",
    cuentaNombre: "Caja chica matriz",
    fondoFijo: "200.00",
    valesPorReintegrar,
    efectivoDisponible: Dinero.de("200.00").menos(valesPorReintegrar).aTexto(),
    totalVales,
    partidaAperturaId: "00000000-0000-4000-8000-000000000010",
    vales,
  };
}

const VALE = {
  id: VALE_ID,
  fecha: "2026-10-05",
  comprobante: "F-001",
  concepto: "Papelería",
  montoNeto: "20.00",
  iva: "2.60",
  total: "22.60",
  estado: "por_reintegrar" as const,
  cuentaGastoId: CUENTA_GASTO,
  cuentaGastoCodigo: "520101",
  cuentaGastoNombre: "Papelería y útiles",
  partidaReintegroId: null,
};

function api(extra: Parameters<typeof simularApi>[0] = {}, cajas: CajaChicaVista[] = []) {
  return simularApi({
    [CAJAS]: { cuerpo: cajas },
    [SUCURSALES]: { cuerpo: [SUCURSAL] },
    [TESORERIA]: { cuerpo: [CAJA_CHICA, ORIGEN] },
    [CATALOGO]: { cuerpo: [GASTO] },
    ...extra,
  });
}

function abrir() {
  return renderizar(<PantallaCajaChica parametros={{ empresaId: E }} />, {
    permisos: PERMISOS,
    todasSucursales: true,
  });
}

describe("pantalla de caja chica (HU-77, S3-T116)", () => {
  it("muestra una sola ruta con tres pestañas y el resumen y los vales del fondo", async () => {
    api({}, [cajaChica([VALE])]);
    const { usuario } = abrir();

    expect(await screen.findByRole("tab", { name: "Caja chica" })).toHaveAttribute("aria-selected", "true");
    await screen.findByText("US$ 200.00");
    expect(screen.getByRole("tab", { name: "Cheques, remesas y notas" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Conciliación bancaria" })).toBeEnabled();
    expect(screen.getByText("US$ 200.00")).toBeInTheDocument();
    expect(screen.getAllByText("US$ 22.60")).toHaveLength(3);
    expect(screen.getByText("US$ 177.40")).toBeInTheDocument();
    const fila = screen.getByText("F-001").closest("tr")!;
    expect(within(fila).getByText("Papelería")).toBeInTheDocument();
    expect(within(fila).getByText("Por reintegrar")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 20.00")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 2.60")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 22.60")).toBeInTheDocument();

    await usuario.click(screen.getByRole("tab", { name: "Cheques, remesas y notas" }));
    expect(await screen.findByRole("heading", { name: "Movimientos bancarios" })).toBeInTheDocument();
    await usuario.click(screen.getByRole("tab", { name: "Conciliación bancaria" }));
    expect(await screen.findByRole("heading", { name: "Conciliación bancaria" })).toBeInTheDocument();
  });

  it("no consulta datos ni ofrece acciones sin permiso de tesorería", async () => {
    const peticiones = api();
    renderizar(<PantallaCajaChica parametros={{ empresaId: E }} />);

    expect(
      await screen.findByText("Tu rol no permite consultar caja chica en esta empresa."),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cheques, remesas y notas" })).toBeEnabled();
    expect(peticiones).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Registrar vale" })).not.toBeInTheDocument();
  });

  it("muestra el estado vacío y abre un fondo con el cuerpo normalizado", async () => {
    const peticiones = api({
      [`POST /empresas/${E}/cajas-chicas`]: {
        estado: 201,
        cuerpo: cajaChica(),
      },
    });
    const { usuario } = abrir();
    expect(
      await screen.findByText("Esta sucursal todavía no tiene una caja chica abierta."),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Abrir caja chica" }));
    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findAllByText("11010201 Caja chica matriz")).toHaveLength(2);
    await usuario.click(within(dialogo).getByRole("button", { name: "Abrir caja chica" }));
    expect(await within(dialogo).findAllByText("Identificador inválido.")).toHaveLength(2);

    await usuario.selectOptions(within(dialogo).getByLabelText("Cuenta de caja chica"), CUENTA_CHICA);
    await usuario.selectOptions(within(dialogo).getByLabelText("Cuenta de origen"), CUENTA_ORIGEN);
    await usuario.clear(within(dialogo).getByLabelText("Fecha de apertura"));
    await usuario.type(within(dialogo).getByLabelText("Fecha de apertura"), "2026-10-01");
    await usuario.click(within(dialogo).getByRole("button", { name: "Abrir caja chica" }));

    await waitFor(() => expect(peticiones.some((peticion) => peticion.metodo === "POST")).toBe(true));
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      sucursalId: S,
      cuentaTesoreriaId: CUENTA_CHICA,
      cuentaOrigenId: CUENTA_ORIGEN,
      fondoFijo: "200.00",
      fecha: "2026-10-01",
    });
  });

  it("permite reintentar la carga luego de un error de API", async () => {
    let intentos = 0;
    api({
      [CAJAS]: () => {
        intentos += 1;
        return intentos === 1
          ? { estado: 503, cuerpo: { message: "Servicio temporalmente no disponible." } }
          : { cuerpo: [] };
      },
    });
    const { usuario } = abrir();

    expect(await screen.findByText(/No se pudo cargar la caja chica/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByText("Esta sucursal todavía no tiene una caja chica abierta."),
    ).toBeInTheDocument();
    expect(intentos).toBe(2);
  });

  it("envía el vale y muestra el rechazo cuando el importe excede el efectivo disponible", async () => {
    const peticiones = api(
      {
        [`POST /empresas/${E}/cajas-chicas/${CAJA_ID}/vales`]: {
          estado: 422,
          cuerpo: { message: "El vale supera el efectivo disponible de caja chica." },
        },
      },
      [cajaChica()],
    );
    const { usuario } = abrir();
    await screen.findAllByText("US$ 200.00");
    await usuario.click(screen.getByRole("button", { name: "Registrar vale" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByRole("option", { name: "520101 Papelería y útiles" });
    await usuario.type(within(dialogo).getByLabelText("Comprobante"), "F-002");
    await usuario.type(within(dialogo).getByLabelText("Concepto"), "Papelería");
    await usuario.selectOptions(within(dialogo).getByLabelText("Cuenta de gasto"), CUENTA_GASTO);
    await usuario.clear(within(dialogo).getByLabelText("Valor neto"));
    await usuario.type(within(dialogo).getByLabelText("Valor neto"), "180.00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar vale" }));

    expect(
      await within(dialogo).findByText("El vale supera el efectivo disponible de caja chica."),
    ).toBeInTheDocument();
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      fecha: expect.any(String),
      comprobante: "F-002",
      concepto: "Papelería",
      montoNeto: "180.00",
      iva: "0.00",
      cuentaGastoId: CUENTA_GASTO,
    });
  });

  it("genera el reintegro con la fecha y la cuenta de origen elegidas", async () => {
    const cajaPendiente = cajaChica([VALE]);
    const cajaReintegrada = cajaChica([
      { ...VALE, estado: "reintegrado", partidaReintegroId: "00000000-0000-4000-8000-000000000011" },
    ]);
    const peticiones = api(
      {
        [`POST /empresas/${E}/cajas-chicas/${CAJA_ID}/reintegrar`]: {
          estado: 201,
          cuerpo: cajaReintegrada,
        },
      },
      [cajaPendiente],
    );
    const { usuario } = abrir();
    await screen.findAllByText("US$ 22.60");
    await usuario.click(screen.getByRole("button", { name: "Reintegrar" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByRole("option", { name: "110101 Caja general" });
    await usuario.selectOptions(within(dialogo).getByLabelText("Cuenta de origen"), CUENTA_ORIGEN);
    await usuario.clear(within(dialogo).getByLabelText("Fecha del reintegro"));
    await usuario.type(within(dialogo).getByLabelText("Fecha del reintegro"), "2026-10-10");
    await usuario.click(within(dialogo).getByRole("button", { name: "Generar reintegro" }));

    await waitFor(() => expect(peticiones.some((peticion) => peticion.metodo === "POST")).toBe(true));
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      fecha: "2026-10-10",
      cuentaOrigenId: CUENTA_ORIGEN,
    });
  });
});
