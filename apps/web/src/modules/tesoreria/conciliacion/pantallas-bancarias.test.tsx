import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type {
  ConciliacionBancariaVista,
  CuentaTesoreriaVista,
  MovimientoBancarioVista,
  ResultadoImportacionEstadoCuenta,
  SucursalDetalle,
} from "@contable/shared";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaCajaChica } from "./pantalla-caja-chica";
import { imprimirDocumento } from "@/modules/reportes/imprimir-documento";

vi.mock("@/modules/reportes/imprimir-documento", () => ({ imprimirDocumento: vi.fn(() => true) }));

const E = "00000000-0000-4000-8000-000000000001";
const S = "00000000-0000-4000-8000-000000000002";
const BANCO_ID = "00000000-0000-4000-8000-000000000003";
const CONTABILIDAD_ID = "00000000-0000-4000-8000-000000000004";
const GASTO_ID = "00000000-0000-4000-8000-000000000005";
const MOV_ID = "00000000-0000-4000-8000-000000000006";
const CONCILIACION_ID = "00000000-0000-4000-8000-000000000007";
const DETALLE_ID = "00000000-0000-4000-8000-000000000008";
const PERMISOS = ["tesoreria.ver", "tesoreria.registrar", "tesoreria.conciliar"] as const;
const CAJAS = `GET /empresas/${E}/cajas-chicas`;
const CUENTAS = `GET /empresas/${E}/cuentas-tesoreria`;
const SUCURSALES = `GET /empresas/${E}/sucursales`;
const CATALOGO = `GET /empresas/${E}/cuentas`;
const MOVIMIENTOS = `GET /empresas/${E}/movimientos-bancarios`;
const CREAR_CONCILIACION = `POST /empresas/${E}/conciliaciones-bancarias`;
const MOVIMIENTO: MovimientoBancarioVista = {
  id: MOV_ID,
  cuentaTesoreriaId: BANCO_ID,
  cuentaBancaria: "Banco Agrícola",
  sucursalId: S,
  sucursal: "Casa matriz",
  cuentaContrapartidaId: GASTO_ID,
  cuentaContrapartidaCodigo: "520101",
  cuentaContrapartidaNombre: "Gastos de operación",
  tipo: "cheque",
  fecha: "2026-10-20",
  referencia: "CH-226",
  comprobante: "F-226",
  beneficiario: "Proveedor Uno",
  concepto: "Pago de proveedor",
  monto: "226.00",
  estadoCheque: "emitido",
  fechaEstado: null,
  partidaId: "00000000-0000-4000-8000-000000000009",
  partidaAnulacionId: null,
  partidaEstado: "borrador",
};
const BANCO: CuentaTesoreriaVista = {
  id: BANCO_ID,
  tipo: "banco",
  nombre: "Banco Agrícola",
  banco: "Banco Agrícola",
  numeroCuenta: "001-001",
  cuentaId: CONTABILIDAD_ID,
  cuentaCodigo: "11010401",
  cuentaNombre: "Banco Agrícola",
  sucursalId: S,
  sucursal: "Casa matriz",
  activa: true,
  saldo: "22070.89",
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
  id: GASTO_ID,
  codigo: "520101",
  nombre: "Gastos de operación",
  nivel: 4,
  naturaleza: "deudora",
  tipo: "costos_gastos",
  cuentaPadreId: null,
  activa: true,
  imputable: true,
};
const CONCILIACION: ConciliacionBancariaVista = {
  id: CONCILIACION_ID,
  cuentaTesoreriaId: BANCO_ID,
  cuentaBancaria: "Banco Agrícola",
  fechaCorte: "2026-10-31",
  saldoEstado: "16655.59",
  depositosEnTransito: "5641.30",
  chequesEnCirculacion: "226.00",
  saldoLibros: "22070.89",
  diferencia: "0.00",
  lineas: [
    {
      partidaDetalleId: DETALLE_ID,
      fecha: "2026-10-15",
      referencia: "DEP-5641",
      concepto: "Remesa en tránsito",
      debe: "5641.30",
      haber: "0.00",
      conciliado: false,
    },
    {
      partidaDetalleId: "00000000-0000-4000-8000-000000000010",
      fecha: "2026-10-20",
      referencia: "CH-226",
      concepto: "Cheque emitido",
      debe: "0.00",
      haber: "226.00",
      conciliado: false,
    },
  ],
  lineasEstadoCuenta: [],
};
const FILA_CSV: ResultadoImportacionEstadoCuenta = {
  numeroFila: 2,
  fecha: "2026-10-15",
  referencia: "DEP-5641",
  descripcion: "Remesa",
  monto: "5641.30",
  estado: "coincide",
  detalle: "Coincidencia exacta por fecha, referencia y monto.",
  partidaDetalleId: DETALLE_ID,
};

function base(extra: Parameters<typeof simularApi>[0] = {}) {
  return simularApi({
    [CAJAS]: { cuerpo: [] },
    [CUENTAS]: { cuerpo: [BANCO] },
    [SUCURSALES]: { cuerpo: [SUCURSAL] },
    [CATALOGO]: { cuerpo: [GASTO] },
    [MOVIMIENTOS]: { cuerpo: [MOVIMIENTO] },
    [`POST /empresas/${E}/movimientos-bancarios`]: { estado: 201, cuerpo: MOVIMIENTO },
    [`PATCH /empresas/${E}/movimientos-bancarios/${MOV_ID}/estado-cheque`]: {
      cuerpo: { ...MOVIMIENTO, estadoCheque: "cobrado" },
    },
    [CREAR_CONCILIACION]: { estado: 201, cuerpo: CONCILIACION },
    [`GET /empresas/${E}/conciliaciones-bancarias/${CONCILIACION_ID}`]: { cuerpo: CONCILIACION },
    [`PATCH /empresas/${E}/conciliaciones-bancarias/${CONCILIACION_ID}/marcas`]: { cuerpo: CONCILIACION },
    [`POST /empresas/${E}/conciliaciones-bancarias/${CONCILIACION_ID}/estado-cuenta/validar`]: {
      cuerpo: [FILA_CSV],
    },
    [`POST /empresas/${E}/conciliaciones-bancarias/${CONCILIACION_ID}/estado-cuenta/importar`]: {
      cuerpo: [FILA_CSV],
    },
    ...extra,
  });
}

function abrir() {
  return renderizar(<PantallaCajaChica parametros={{ empresaId: E }} />, {
    permisos: [...PERMISOS],
    todasSucursales: true,
  });
}

async function cambiarPestana(nombre: string) {
  const { usuario } = abrir();
  await screen.findByRole("tab", { name: "Caja chica" });
  await usuario.click(screen.getByRole("tab", { name: nombre }));
  return usuario;
}

describe("pestañas bancarias (HU-78 a HU-80, S3-T119, T122 y T125)", () => {
  it("registra un cheque con su comprobante y envía los importes normalizados", async () => {
    const peticiones = base();
    const usuario = await cambiarPestana("Cheques, remesas y notas");
    await screen.findByText("CH-226");
    await usuario.click(screen.getByRole("button", { name: "Registrar movimiento" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.selectOptions(within(dialogo).getByLabelText("Cuenta contable"), GASTO_ID);
    await usuario.clear(within(dialogo).getByLabelText("Referencia"));
    await usuario.type(within(dialogo).getByLabelText("Referencia"), "CH-227");
    await usuario.clear(within(dialogo).getByLabelText("Comprobante"));
    await usuario.type(within(dialogo).getByLabelText("Comprobante"), "F-227");
    await usuario.type(within(dialogo).getByLabelText("Proveedor o beneficiario"), "Proveedor Dos");
    await usuario.type(within(dialogo).getByLabelText("Concepto"), "Pago de factura");
    await usuario.type(within(dialogo).getByLabelText("Monto"), "226.5");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar movimiento" }));
    const peticion = peticiones.find(
      (item) => item.metodo === "POST" && item.ruta.endsWith("/movimientos-bancarios"),
    );
    expect(peticion?.cuerpo).toEqual({
      cuentaTesoreriaId: BANCO_ID,
      sucursalId: S,
      cuentaContrapartidaId: GASTO_ID,
      tipo: "cheque",
      fecha: expect.any(String),
      referencia: "CH-227",
      comprobante: "F-227",
      beneficiario: "Proveedor Dos",
      concepto: "Pago de factura",
      monto: "226.50",
    });
  });

  it("muestra la validación del formulario y el rechazo de una referencia duplicada", async () => {
    const peticiones = base({
      [`POST /empresas/${E}/movimientos-bancarios`]: {
        estado: 409,
        cuerpo: { message: "Ya existe esa referencia en la cuenta bancaria." },
      },
    });
    const usuario = await cambiarPestana("Cheques, remesas y notas");
    await usuario.click(screen.getByRole("button", { name: "Registrar movimiento" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar movimiento" }));
    expect(await within(dialogo).findByText("Identificador inválido.")).toBeInTheDocument();
    await usuario.selectOptions(within(dialogo).getByLabelText("Cuenta contable"), GASTO_ID);
    await usuario.type(within(dialogo).getByLabelText("Referencia"), "CH-DUP");
    await usuario.type(within(dialogo).getByLabelText("Comprobante"), "F-DUP");
    await usuario.type(within(dialogo).getByLabelText("Concepto"), "Pago duplicado");
    await usuario.type(within(dialogo).getByLabelText("Monto"), "22.00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar movimiento" }));
    expect(
      await within(dialogo).findByText("Ya existe esa referencia en la cuenta bancaria."),
    ).toBeInTheDocument();
    expect(
      peticiones.find(
        (peticion) => peticion.metodo === "POST" && peticion.ruta.endsWith("/movimientos-bancarios"),
      )?.cuerpo,
    ).toMatchObject({
      cuentaTesoreriaId: BANCO_ID,
      sucursalId: S,
      cuentaContrapartidaId: GASTO_ID,
      tipo: "cheque",
      referencia: "CH-DUP",
      comprobante: "F-DUP",
      concepto: "Pago duplicado",
      monto: "22.00",
    });
  });

  it("contrasta las tres cifras de octubre y permite marcar movimientos conciliados", async () => {
    const peticiones = base();
    const usuario = await cambiarPestana("Conciliación bancaria");
    await usuario.clear(screen.getByLabelText("Saldo según estado de cuenta"));
    await usuario.type(screen.getByLabelText("Saldo según estado de cuenta"), "16655.59");
    await usuario.clear(screen.getByLabelText("Fecha de corte"));
    await usuario.type(screen.getByLabelText("Fecha de corte"), "2026-10-31");
    await usuario.click(screen.getByRole("button", { name: "Consultar conciliación" }));
    await screen.findByText("Sin diferencia");
    expect(screen.getByText("US$ 16,655.59")).toBeInTheDocument();
    expect(screen.getAllByText("US$ 5,641.30")).toHaveLength(2);
    expect(screen.getAllByText("US$ 226.00")).toHaveLength(2);
    expect(screen.getByText("US$ 22,070.89")).toBeInTheDocument();
    await usuario.click(screen.getByRole("checkbox", { name: "Banco DEP-5641" }));
    const marca = peticiones.find((item) => item.metodo === "PATCH" && item.ruta.endsWith("/marcas"));
    expect(marca?.cuerpo).toEqual({ partidaDetalleId: DETALLE_ID, conciliado: true });
    const crear = peticiones.find(
      (item) => item.metodo === "POST" && item.ruta.endsWith("/conciliaciones-bancarias"),
    );
    expect(crear?.cuerpo).toEqual({
      cuentaTesoreriaId: BANCO_ID,
      fechaCorte: "2026-10-31",
      saldoEstado: "16655.59",
    });
  });

  it("muestra vista previa de CSV, importa las filas válidas y construye el reporte PDF", async () => {
    const peticiones = base();
    const usuario = await cambiarPestana("Conciliación bancaria");
    await usuario.clear(screen.getByLabelText("Saldo según estado de cuenta"));
    await usuario.type(screen.getByLabelText("Saldo según estado de cuenta"), "16655.59");
    await usuario.click(screen.getByRole("button", { name: "Consultar conciliación" }));
    await screen.findByText("Sin diferencia");
    await usuario.click(screen.getByRole("button", { name: /Importar estado de cuenta/ }));
    const archivo = new File(["fecha;referencia;descripcion;monto"], "octubre.csv", { type: "text/csv" });
    await usuario.upload(screen.getByLabelText("Archivo CSV"), archivo);
    await usuario.click(screen.getByRole("button", { name: "Vista previa" }));
    await screen.findByText("Coincide");
    await usuario.click(screen.getByRole("button", { name: "Importar filas válidas" }));
    const subida = peticiones.find((item) => item.ruta.endsWith("/estado-cuenta/importar"));
    expect(subida?.cuerpo).toBeInstanceOf(FormData);
    expect((subida?.cuerpo as FormData).get("archivo")).toMatchObject({ name: "octubre.csv" });
    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    await usuario.click(screen.getByRole("button", { name: "Exportar PDF" }));
    expect(vi.mocked(imprimirDocumento)).toHaveBeenCalledWith(
      expect.stringContaining("Conciliación bancaria"),
    );
  });
});
