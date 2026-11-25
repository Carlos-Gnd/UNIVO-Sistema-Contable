import {
  Dinero,
  type ClasificacionContribuyente,
  type ClaseGravamen,
  type ConsultaDocumentos,
  type CondicionPago,
  type CuentaInfo,
  type DocumentoComercialResumen,
  type DocumentoComercialVista,
  type LineaPartida,
  type OperacionComercial,
  type TipoDocumentoComercial,
  type TotalesDocumento,
} from "@contable/shared";

/** El número de documento ya está registrado para ese proveedor o en las ventas de la empresa. */
export class DocumentoDuplicadoError extends Error {
  constructor(tipo: string, numero: string) {
    super(`Ya está registrado el documento ${tipo.toUpperCase()} ${numero}.`);
  }
}

export class DocumentoNoEncontradoError extends Error {
  constructor() {
    super("El documento no existe en esta empresa.");
  }
}

/** Códigos del catálogo de cuentas que usan las compras y ventas; se resuelven a la cuenta de último nivel. */
export const CUENTAS_COMERCIALES = {
  inventario: "1109",
  compras: "4101",
  costoVentas: "4104",
  ventas: "5101",
  creditoFiscal: "1112",
  ivaPercibidoActivo: "111301",
  ivaRetenidoActivo: "111302",
  debitoFiscal: "2109",
  ivaPercibidoPasivo: "211001",
  ivaRetenidoPasivo: "211002",
  cuentasPorPagar: "2102",
  cuentasPorCobrar: "1103",
} as const;

export interface CuentaResuelta {
  id: string;
  codigo: string;
}

export interface ParametrosComerciales {
  clasificacion: ClasificacionContribuyente;
  sistemaInventario: "perpetuo" | "analitico";
}

/** Línea ya validada y calculada, lista para guardarse. */
export interface LineaDocumentoGuardar {
  orden: number;
  productoId: string | null;
  cuentaId: string | null;
  descripcion: string;
  clase: ClaseGravamen;
  cantidad: string;
  precioUnitario: string;
  monto: string;
  movimientoInventarioId: string | null;
}

export interface DatosDocumentoGuardar {
  id: string;
  empresaId: string;
  sucursalId: string;
  operacion: OperacionComercial;
  tipoDocumento: TipoDocumentoComercial;
  numeroDocumento: string;
  fecha: string;
  terceroId: string | null;
  condicionPago: CondicionPago;
  cuentaPagoId: string | null;
  diasCredito: number;
  fechaVencimiento: string | null;
  totales: TotalesDocumento;
  partidaId: string;
  observaciones: string | null;
  usuarioId: string;
  lineas: readonly LineaDocumentoGuardar[];
}

export interface DatosPartidaBorrador {
  empresaId: string;
  sucursalId: string;
  usuarioId: string;
  fecha: string;
  concepto: string;
  documentoTipo: string;
  documentoNumero: string;
  origen: "compras" | "ventas";
  origenId: string;
  lineas: readonly (LineaPartida & { concepto: string })[];
}

export interface FiltroDocumentos extends ConsultaDocumentos {
  operacion: OperacionComercial;
  /** Sucursales que puede ver el usuario; null si ve todas */
  sucursales: readonly string[] | null;
}

export interface DatosTerceroDocumento {
  id: string;
  nombre: string;
  nrc: string | null;
  clasificacion: ClasificacionContribuyente;
  esCliente: boolean;
  esProveedor: boolean;
  activo: boolean;
  diasCredito: number;
}

export type { CuentaInfo, DocumentoComercialResumen, DocumentoComercialVista };

/** Suma por cuenta respetando el orden de primera aparición: una línea de partida por cuenta. */
export function agruparPorCuenta(
  filas: readonly { cuentaId: string; monto: string }[],
): { cuentaId: string; monto: string }[] {
  const mapa = new Map<string, Dinero>();
  for (const f of filas) mapa.set(f.cuentaId, (mapa.get(f.cuentaId) ?? Dinero.cero()).mas(f.monto));
  return [...mapa].map(([cuentaId, monto]) => ({ cuentaId, monto: monto.aTexto() }));
}

export interface CuentasPartidaCompra {
  creditoFiscalId?: string;
  ivaPercibidoId?: string;
  ivaRetenidoId?: string;
  /** Caja o banco al contado, cuentas por pagar al crédito: por el total neto */
  contrapartidaId: string;
}

/**
 * Líneas de la partida de una compra:
 * Debe: lo comprado (inventario, compras, gasto o activo), crédito fiscal e IVA percibido.
 * Haber: caja, banco o cuentas por pagar por el total neto, e IVA retenido por pagar.
 */
export function armarPartidaCompra(
  debitos: readonly { cuentaId: string; monto: string }[],
  totales: TotalesDocumento,
  cuentas: CuentasPartidaCompra,
  concepto: string,
): (LineaPartida & { concepto: string })[] {
  const lineas: (LineaPartida & { concepto: string })[] = [];
  for (const d of agruparPorCuenta(debitos)) {
    lineas.push({ cuentaId: d.cuentaId, debe: d.monto, haber: "0.00", concepto });
  }
  if (!Dinero.de(totales.iva).esCero()) {
    lineas.push({ cuentaId: cuentas.creditoFiscalId!, debe: totales.iva, haber: "0.00", concepto });
  }
  if (!Dinero.de(totales.ivaPercibido).esCero()) {
    lineas.push({ cuentaId: cuentas.ivaPercibidoId!, debe: totales.ivaPercibido, haber: "0.00", concepto });
  }
  lineas.push({ cuentaId: cuentas.contrapartidaId, debe: "0.00", haber: totales.totalNeto, concepto });
  if (!Dinero.de(totales.ivaRetenido).esCero()) {
    lineas.push({ cuentaId: cuentas.ivaRetenidoId!, debe: "0.00", haber: totales.ivaRetenido, concepto });
  }
  return lineas;
}

/** Fecha más un número de días (AAAA-MM-DD), sin zonas horarias. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
