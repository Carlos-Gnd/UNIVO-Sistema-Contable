// Datos de las pruebas de facturación electrónica: CheroPhonex emite a Tecno Plaza San Miguel.
import type {
  CuentaTesoreriaVista,
  DisponibleNota,
  DocumentoComercialVista,
  DteResumen,
  DteVista,
  ProductoVista,
  SucursalDetalle,
  TerceroVista,
} from "@contable/shared";

export const E = "e1";
export const CLIENTE = "11111111-1111-4111-8111-111111111111";
export const SIN_NRC = "11111111-1111-4111-8111-222222222222";
export const PRODUCTO = "22222222-2222-4222-8222-222222222222";
export const SUCURSAL = "33333333-3333-4333-8333-333333333333";
export const CAJA = "44444444-4444-4444-8444-444444444444";
export const VENTA = "55555555-5555-4555-8555-555555555555";
export const INGRESO = "66666666-6666-4666-8666-666666666666";

export const RUTAS = {
  dtes: `GET /empresas/${E}/dte`,
  venta: `POST /empresas/${E}/dte/ventas`,
  nota: `POST /empresas/${E}/dte/notas`,
  dte: (id: string) => `GET /empresas/${E}/dte/${id}`,
  pdf: (id: string) => `GET /empresas/${E}/dte/${id}/pdf`,
  json: (id: string) => `GET /empresas/${E}/dte/${id}/json`,
  invalidar: (id: string) => `POST /empresas/${E}/dte/${id}/invalidar`,
};

export const resumenDte = (extra: Partial<DteResumen> = {}): DteResumen => ({
  id: "dte-ccf",
  tipoDte: "03",
  nombreTipo: "Comprobante de crédito fiscal",
  numeroControl: "DTE-03-M001P001-000000000000001",
  codigoGeneracion: "8E1F2D3C-4B5A-4C6D-8E7F-1A2B3C4D5E6F",
  fechaEmision: "2026-11-27",
  horaEmision: "10:15:00",
  sucursalId: SUCURSAL,
  receptor: "Tecno Plaza San Miguel, S.A. de C.V.",
  total: "565.00",
  iva: "65.00",
  estado: "procesado",
  selloRecepcion: "2026A1B2C3D4E5F60718293A4B5C6D7E8F9012AB",
  documentoId: VENTA,
  notaId: null,
  relacionado: null,
  invalidacion: null,
  ...extra,
});

export const vistaDte = (extra: Partial<DteVista> = {}): DteVista => ({
  ...resumenDte(),
  documento: { identificacion: { version: 3, ambiente: "00", tipoDte: "03" } },
  firma: "eyJhbGciOiJSUzUxMiJ9.e30.firma",
  respuesta: { estado: "PROCESADO" },
  enlaceConsulta:
    "https://admin.factura.gob.sv/consultaPublica?ambiente=00&codGen=8E1F2D3C-4B5A-4C6D-8E7F-1A2B3C4D5E6F&fechaEmi=2026-11-27",
  firmaValida: true,
  evento: null,
  ...extra,
});

export const cliente: TerceroVista = {
  id: CLIENTE,
  nombre: "Tecno Plaza San Miguel, S.A. de C.V.",
  nit: "1234-567890-123-0",
  nrc: "245871-4",
  actividadEconomica: "47411 · Venta de equipo de telefonía",
  clasificacion: "otro",
  direccion: "Av. Roosevelt, San Miguel",
  telefono: null,
  correo: "compras@tecnoplaza.test",
  esCliente: true,
  esProveedor: false,
  diasCredito: 30,
  activo: true,
};

export const clienteSinNrc: TerceroVista = {
  ...cliente,
  id: SIN_NRC,
  nombre: "Juan Pérez",
  nit: "0000-000000-105-1",
  nrc: null,
};

export const producto: ProductoVista = {
  id: PRODUCTO,
  codigo: "CP-01",
  nombre: "Samsung Galaxy A15",
  categoriaId: null,
  categoria: null,
  unidadMedida: "unidad",
  precioVenta: "250.00",
  existenciaMinima: "0.0000",
  metodoValuacion: null,
  controlaSeries: false,
  activo: true,
};

export const sucursal: SucursalDetalle = {
  id: SUCURSAL,
  empresaId: E,
  nombre: "Casa matriz",
  codigoEstablecimiento: "M001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz: true,
  activa: true,
  creadoEn: "2026-01-01T00:00:00Z",
  actualizadoEn: "2026-01-01T00:00:00Z",
};

export const caja = {
  id: "ct1",
  tipo: "caja",
  nombre: "Caja general",
  banco: null,
  numeroCuenta: null,
  cuentaId: CAJA,
  cuentaCodigo: "110101",
  cuentaNombre: "Caja general",
  sucursalId: null,
  sucursal: null,
  activa: true,
  saldo: "0.00",
} satisfies CuentaTesoreriaVista;

export const cuentaIngreso = {
  id: INGRESO,
  codigo: "510201",
  nombre: "Ingresos por servicios técnicos",
  nivel: 4,
  naturaleza: "acreedora" as const,
  tipo: "ingresos" as const,
  cuentaPadreId: null,
  activa: true,
};

/** Lo que necesitan los formularios de emisión para cargar sus listas. */
export const APOYO = {
  [`GET /empresas/${E}/terceros`]: { cuerpo: [cliente, clienteSinNrc] },
  [`GET /empresas/${E}/productos`]: { cuerpo: [producto] },
  [`GET /empresas/${E}/sucursales`]: { cuerpo: [sucursal] },
  [`GET /empresas/${E}/cuentas-tesoreria`]: { cuerpo: [caja] },
  [`GET /empresas/${E}/cuentas`]: { cuerpo: [cuentaIngreso] },
  [`GET /empresas/${E}`]: { cuerpo: { id: E, clasificacion: "otro" } },
};

/** Venta del CCF electrónico: dos Galaxy A15 a US$ 250.00 al contado. */
export const ventaCcf: DocumentoComercialVista = {
  id: VENTA,
  operacion: "venta",
  tipoDocumento: "ccf",
  numeroDocumento: "DTE-03-M001P001-000000000000001",
  numeroDocumentoHasta: null,
  fecha: "2026-11-27",
  sucursalId: SUCURSAL,
  tercero: { id: CLIENTE, nombre: cliente.nombre, nit: cliente.nit, nrc: cliente.nrc },
  condicionPago: "contado",
  cuentaPagoId: CAJA,
  diasCredito: 0,
  fechaVencimiento: null,
  totalGravado: "500.00",
  totalExento: "0.00",
  totalNoSujeto: "0.00",
  iva: "65.00",
  ivaPercibido: "0.00",
  ivaRetenido: "0.00",
  total: "565.00",
  totalNeto: "565.00",
  partidaId: "p1",
  estadoPartida: "contabilizada",
  partidaCostoId: "p2",
  observaciones: null,
  lineas: [
    {
      orden: 1,
      productoId: PRODUCTO,
      productoCodigo: "CP-01",
      cuentaId: null,
      descripcion: "Samsung Galaxy A15",
      clase: "gravada",
      cantidad: "2.0000",
      precioUnitario: "250.0000",
      monto: "500.00",
      costoKardex: "360.00",
    },
  ],
};

export const disponibleCcf: DisponibleNota = {
  documentoId: VENTA,
  saldo: "0.00",
  lineas: [
    {
      orden: 1,
      productoId: PRODUCTO,
      productoCodigo: "CP-01",
      descripcion: "Samsung Galaxy A15",
      clase: "gravada",
      cantidad: "2.0000",
      precioUnitario: "250.0000",
      monto: "500.00",
      cantidadDisponible: "2.0000",
      montoDisponible: "500.00",
    },
  ],
};
