import { createHmac, randomUUID } from "node:crypto";
import { Dinero, type ClaseGravamen, type CondicionPago, type TotalesDocumento } from "@contable/shared";
import { totalEnLetras } from "./total-letras.js";

/**
 * Documentos tributarios electrónicos (EP-08) según los esquemas JSON del Ministerio de Hacienda:
 * factura de consumidor final (01, versión 1), comprobante de crédito fiscal (03, versión 3), nota de crédito
 * (05, versión 3), nota de débito (06, versión 3) y el evento de invalidación (versión 2).
 * Siempre en ambiente de pruebas (00): la transmisión y el sello de recepción son simulados.
 */

export const TIPOS_DTE = { factura: "01", ccf: "03", notaCredito: "05", notaDebito: "06" } as const;
export type TipoDte = (typeof TIPOS_DTE)[keyof typeof TIPOS_DTE];

export const NOMBRE_DTE: Record<TipoDte, string> = {
  "01": "Factura",
  "03": "Comprobante de crédito fiscal",
  "05": "Nota de crédito",
  "06": "Nota de débito",
};

const VERSION: Record<TipoDte, number> = { "01": 1, "03": 3, "05": 3, "06": 3 };

/** Ambiente de pruebas de Hacienda: el único que usa el sistema. */
export const AMBIENTE_PRUEBAS = "00";
/** Consulta pública de Hacienda a la que lleva el QR de la representación gráfica. */
export const URL_CONSULTA_PUBLICA = "https://admin.factura.gob.sv/consultaPublica";

/** Regla de facturación electrónica que impide emitir o invalidar. */
export class ReglaDteError extends Error {}

export class DteNoEncontradoError extends Error {
  constructor() {
    super("El documento electrónico no existe en esta empresa.");
  }
}

// ───────────────────────────── Identificación ─────────────────────────────

/** Código de generación: UUID en mayúsculas. */
export const nuevoCodigoGeneracion = () => randomUUID().toUpperCase();

/**
 * Número de control: DTE-{tipo}-{establecimiento (4)}{punto de venta (4)}-{correlativo de 15 dígitos}.
 * El correlativo es por tipo de documento, establecimiento y punto de venta, y se reinicia cada año.
 */
export function numeroControl(
  tipo: TipoDte,
  codigoEstablecimiento: string,
  codigoPuntoVenta: string,
  correlativo: number,
): string {
  const codigo = (c: string) =>
    c
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .padStart(4, "0")
      .slice(-4);
  if (!Number.isSafeInteger(correlativo) || correlativo < 1) throw new RangeError("Correlativo inválido.");
  return `DTE-${tipo}-${codigo(codigoEstablecimiento)}${codigo(codigoPuntoVenta)}-${String(correlativo).padStart(15, "0")}`;
}

/** Fecha (AAAA-MM-DD) y hora (HH:mm:ss) actuales en El Salvador. */
export function fechaHoraElSalvador(ahora: Date = new Date()): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ahora);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  return {
    fecha: `${p("year")}-${p("month")}-${p("day")}`,
    hora: `${p("hour")}:${p("minute")}:${p("second")}`,
  };
}

/**
 * Sello de recepción simulado (40 caracteres: año y 36 hexadecimales). En producción lo asigna Hacienda al recibir
 * el DTE; aquí se deriva del documento firmado con un secreto del servidor, así no se puede fabricar fuera de la API.
 */
export function selloRecepcion(
  anio: string,
  codigoGeneracion: string,
  firma: string,
  secreto: string,
): string {
  const hmac = createHmac("sha256", secreto).update(`${codigoGeneracion}.${firma}`).digest("hex");
  return `${anio}${hmac.slice(0, 36).toUpperCase()}`;
}

/** Enlace de la consulta pública de Hacienda para el QR del DTE. */
export function enlaceConsulta(codigoGeneracion: string, fechaEmision: string): string {
  const q = new URLSearchParams({
    ambiente: AMBIENTE_PRUEBAS,
    codGen: codigoGeneracion,
    fechaEmi: fechaEmision,
  });
  return `${URL_CONSULTA_PUBLICA}?${q.toString()}`;
}

// ───────────────────────────── Emisor y receptor ─────────────────────────────

const DEPARTAMENTOS: [string, RegExp][] = [
  ["01", /ahuachap[aá]n/i],
  ["02", /santa\s+ana/i],
  ["03", /sonsonate/i],
  ["04", /chalatenango/i],
  ["05", /la\s+libertad/i],
  ["07", /cuscatl[aá]n/i],
  ["08", /la\s+paz/i],
  ["09", /caba[ñn]as/i],
  ["10", /san\s+vicente/i],
  ["11", /usulut[aá]n/i],
  ["12", /san\s+miguel/i],
  ["13", /moraz[aá]n/i],
  ["14", /la\s+uni[oó]n/i],
  ["06", /san\s+salvador/i],
];

/**
 * Departamento (CAT-012) que se reconoce en el texto de la dirección; San Salvador si no se reconoce ninguno. La
 * empresa y los clientes guardan la dirección como texto libre: en el ambiente simulado basta con el departamento.
 */
export function departamentoDeDireccion(direccion: string | null): string {
  if (!direccion) return "06";
  return DEPARTAMENTOS.find(([, patron]) => patron.test(direccion))?.[0] ?? "06";
}

/** Municipio (CAT-013) del ambiente simulado: el primero del departamento. */
export const MUNICIPIO_SIMULADO = "01";

/** Actividad «Otros» de CAT-019, para quien no registra su código de actividad económica. */
export const ACTIVIDAD_OTROS = { codigo: "10005", descripcion: "Otros" } as const;

/**
 * Código y descripción de la actividad económica (CAT-019) a partir del texto que guarda la empresa o el cliente,
 * por ejemplo «46900 · Venta al por mayor de otros productos».
 */
export function actividadEconomica(texto: string | null): { codigo: string; descripcion: string } {
  const limpio = texto?.trim() ?? "";
  const m = /^(\d{2,6})\s*[-·.:]?\s*(.*)$/u.exec(limpio);
  if (m) return { codigo: m[1]!, descripcion: (m[2] || limpio).slice(0, 150) };
  return limpio
    ? { codigo: ACTIVIDAD_OTROS.codigo, descripcion: limpio.slice(0, 150) }
    : { ...ACTIVIDAD_OTROS };
}

/** Solo los dígitos de un NIT, NRC o DUI, como los pide el esquema. */
export const soloDigitos = (valor: string) => valor.replace(/\D/g, "");

export interface EmpresaEmisora {
  nombre: string;
  nombreComercial: string | null;
  nit: string;
  nrc: string | null;
  actividadEconomica: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
}

export interface SucursalEmisora {
  codigoEstablecimiento: string;
  codigoPuntoVenta: string;
  esMatriz: boolean;
  direccion: string | null;
}

export interface TerceroReceptor {
  nombre: string;
  nit: string;
  nrc: string | null;
  actividadEconomica: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
}

/** Datos de la empresa que exige el DTE; un error claro lista lo que falta completar. */
export function exigirEmisor(empresa: EmpresaEmisora): void {
  const faltan: string[] = [];
  if (!empresa.nrc) faltan.push("NRC");
  if (!empresa.direccion) faltan.push("dirección");
  if (!empresa.telefono || empresa.telefono.length < 8) faltan.push("teléfono");
  if (!empresa.correo) faltan.push("correo");
  if (faltan.length > 0) {
    throw new ReglaDteError(
      `Para emitir documentos electrónicos completa en los datos de la empresa: ${faltan.join(", ")}.`,
    );
  }
}

function emisor(empresa: EmpresaEmisora, sucursal: SucursalEmisora, conEstablecimiento: boolean) {
  const actividad = actividadEconomica(empresa.actividadEconomica);
  const direccion = sucursal.direccion ?? empresa.direccion!;
  return {
    nit: soloDigitos(empresa.nit),
    nrc: soloDigitos(empresa.nrc!),
    nombre: empresa.nombre,
    codActividad: actividad.codigo,
    descActividad: actividad.descripcion,
    nombreComercial: empresa.nombreComercial,
    // CAT-009: 02 casa matriz, 01 sucursal
    tipoEstablecimiento: sucursal.esMatriz ? "02" : "01",
    direccion: {
      departamento: departamentoDeDireccion(direccion),
      municipio: MUNICIPIO_SIMULADO,
      complemento: direccion.slice(0, 200),
    },
    telefono: empresa.telefono!,
    correo: empresa.correo!,
    ...(conEstablecimiento
      ? {
          codEstableMH: null,
          codEstable: sucursal.codigoEstablecimiento,
          codPuntoVentaMH: null,
          codPuntoVenta: sucursal.codigoPuntoVenta,
        }
      : {}),
  };
}

/** Receptor de una factura: todos sus datos son opcionales (consumidor final). */
function receptorFactura(t: TerceroReceptor | null) {
  if (!t) {
    return {
      tipoDocumento: null,
      numDocumento: null,
      nrc: null,
      nombre: null,
      codActividad: null,
      descActividad: null,
      direccion: null,
      telefono: null,
      correo: null,
    };
  }
  const actividad = t.actividadEconomica ? actividadEconomica(t.actividadEconomica) : null;
  return {
    // CAT-022: 36 NIT
    tipoDocumento: "36",
    numDocumento: soloDigitos(t.nit),
    nrc: t.nrc ? soloDigitos(t.nrc) : null,
    nombre: t.nombre,
    codActividad: actividad?.codigo ?? null,
    descActividad: actividad?.descripcion ?? null,
    direccion: t.direccion
      ? {
          departamento: departamentoDeDireccion(t.direccion),
          municipio: MUNICIPIO_SIMULADO,
          complemento: t.direccion.slice(0, 200),
        }
      : null,
    telefono: t.telefono && t.telefono.length >= 8 ? t.telefono : null,
    correo: t.correo,
  };
}

/** Receptor de un CCF o de una nota: contribuyente con NIT y NRC. */
function receptorContribuyente(t: TerceroReceptor) {
  if (!t.nrc) {
    throw new ReglaDteError("El cliente no tiene NRC: un comprobante de crédito fiscal lo exige.");
  }
  const actividad = actividadEconomica(t.actividadEconomica);
  const direccion = t.direccion ?? "Sin dirección registrada";
  return {
    nit: soloDigitos(t.nit),
    nrc: soloDigitos(t.nrc),
    nombre: t.nombre,
    codActividad: actividad.codigo,
    descActividad: actividad.descripcion,
    nombreComercial: null,
    direccion: {
      departamento: departamentoDeDireccion(t.direccion),
      municipio: MUNICIPIO_SIMULADO,
      complemento: direccion.slice(0, 200),
    },
    telefono: t.telefono && t.telefono.length >= 8 ? t.telefono : null,
    correo: t.correo,
  };
}

// ───────────────────────────── Cuerpo y resumen ─────────────────────────────

export interface LineaDte {
  descripcion: string;
  codigo: string | null;
  cantidad: string;
  precioUnitario: string;
  /** Importe con la convención del documento: con IVA en factura, sin IVA en CCF y notas */
  monto: string;
  clase: ClaseGravamen;
  /** Un producto del inventario (bien); si no, un servicio */
  bien: boolean;
}

const n = (monto: string | Dinero) => Number(typeof monto === "string" ? monto : monto.aTexto());
const decimales = (valor: string, maximo: number) => Number(Number(valor).toFixed(maximo));

/**
 * IVA incluido en cada línea gravada de una factura: el importe menos su base (importe ÷ 1.13). El residuo de
 * centavos va a la última línea gravada para que la suma sea exactamente el IVA del documento.
 */
export function ivaPorLinea(lineas: readonly LineaDte[], ivaTotal: string): string[] {
  const iva = lineas.map((l) =>
    l.clase === "gravada" ? Dinero.de(l.monto).menos(Dinero.de(l.monto).dividido("1.13")).aTexto() : "0.00",
  );
  const ultima = lineas.map((l) => l.clase).lastIndexOf("gravada");
  if (ultima >= 0) {
    const diferencia = Dinero.de(ivaTotal).menos(Dinero.sumar(iva));
    iva[ultima] = Dinero.de(iva[ultima]!).mas(diferencia).aTexto();
  }
  return iva;
}

function item(l: LineaDte, i: number) {
  const monto = n(l.monto);
  return {
    numItem: i + 1,
    // CAT-011: 1 bienes, 2 servicios
    tipoItem: l.bien ? 1 : 2,
    numeroDocumento: null as string | null,
    cantidad: decimales(l.cantidad, 8),
    codigo: l.codigo,
    codTributo: null,
    // CAT-014: 59 unidad, 99 otra (servicios)
    uniMedida: l.bien ? 59 : 99,
    descripcion: l.descripcion.slice(0, 1000),
    precioUni: decimales(l.precioUnitario, 8),
    montoDescu: 0,
    ventaNoSuj: l.clase === "no_sujeta" ? monto : 0,
    ventaExenta: l.clase === "exenta" ? monto : 0,
    ventaGravada: l.clase === "gravada" ? monto : 0,
  };
}

function pagos(condicion: CondicionPago, monto: string, diasCredito: number) {
  // CAT-017: 01 billetes y monedas; 99 otros (crédito). CAT-018: 01 plazo en días
  return condicion === "contado"
    ? [{ codigo: "01", montoPago: n(monto), referencia: null, plazo: null, periodo: null }]
    : [{ codigo: "99", montoPago: n(monto), referencia: null, plazo: "01", periodo: diasCredito || null }];
}

const tributoIva = (iva: string) =>
  Dinero.de(iva).esCero()
    ? null
    : [{ codigo: "20", descripcion: "Impuesto al Valor Agregado 13%", valor: n(iva) }];

// ───────────────────────────── Documentos ─────────────────────────────

export interface DatosEmisionDte {
  tipo: TipoDte;
  codigoGeneracion: string;
  numeroControl: string;
  fecha: string;
  hora: string;
  empresa: EmpresaEmisora;
  sucursal: SucursalEmisora;
  receptor: TerceroReceptor | null;
  lineas: readonly LineaDte[];
  totales: TotalesDocumento;
  condicionPago: CondicionPago;
  diasCredito: number;
  observaciones: string | null;
  /** Documento que corrige una nota de crédito o débito */
  relacionado?: { tipo: TipoDte; codigoGeneracion: string; fecha: string };
}

function identificacion(d: DatosEmisionDte) {
  return {
    version: VERSION[d.tipo],
    ambiente: AMBIENTE_PRUEBAS,
    tipoDte: d.tipo,
    numeroControl: d.numeroControl,
    codigoGeneracion: d.codigoGeneracion,
    // Modelo de facturación previo (1) y transmisión normal (1), sin contingencia
    tipoModelo: 1,
    tipoOperacion: 1,
    tipoContingencia: null,
    motivoContin: null,
    fecEmi: d.fecha,
    horEmi: d.hora,
    tipoMoneda: "USD",
  };
}

const apendice = (observaciones: string | null) =>
  observaciones
    ? [{ campo: "observaciones", etiqueta: "Observaciones", valor: observaciones.slice(0, 150) }]
    : null;

const sumaVentas = (t: TotalesDocumento, gravadaConIva: boolean) =>
  Dinero.de(t.totalNoSujeto)
    .mas(t.totalExento)
    .mas(gravadaConIva ? Dinero.de(t.totalGravado).mas(t.iva) : t.totalGravado);

/** Factura de consumidor final (01): los importes incluyen el IVA, que se informa aparte en totalIva. */
function factura(d: DatosEmisionDte) {
  const t = d.totales;
  const ivaLineas = ivaPorLinea(d.lineas, t.iva);
  const subTotal = sumaVentas(t, true);
  const totalPagar = subTotal.menos(t.ivaRetenido);
  return {
    identificacion: identificacion(d),
    documentoRelacionado: null,
    emisor: emisor(d.empresa, d.sucursal, true),
    receptor: receptorFactura(d.receptor),
    otrosDocumentos: null,
    ventaTercero: null,
    cuerpoDocumento: d.lineas.map((l, i) => ({
      ...item(l, i),
      tributos: null,
      psv: 0,
      noGravado: 0,
      ivaItem: n(ivaLineas[i]!),
    })),
    resumen: {
      totalNoSuj: n(t.totalNoSujeto),
      totalExenta: n(t.totalExento),
      totalGravada: n(Dinero.de(t.totalGravado).mas(t.iva)),
      subTotalVentas: n(subTotal),
      descuNoSuj: 0,
      descuExenta: 0,
      descuGravada: 0,
      porcentajeDescuento: 0,
      totalDescu: 0,
      tributos: null,
      subTotal: n(subTotal),
      ivaRete1: n(t.ivaRetenido),
      reteRenta: 0,
      montoTotalOperacion: n(subTotal),
      totalNoGravado: 0,
      totalPagar: n(totalPagar),
      totalLetras: totalEnLetras(totalPagar.aTexto()),
      totalIva: n(t.iva),
      saldoFavor: 0,
      condicionOperacion: d.condicionPago === "contado" ? 1 : 2,
      pagos: pagos(d.condicionPago, totalPagar.aTexto(), d.diasCredito),
      numPagoElectronico: null,
    },
    extension: null,
    apendice: apendice(d.observaciones),
  };
}

/** Comprobante de crédito fiscal (03): importes sin IVA; el IVA va en los tributos del resumen. */
function ccf(d: DatosEmisionDte) {
  if (!d.receptor) throw new ReglaDteError("Un comprobante de crédito fiscal necesita el cliente.");
  const t = d.totales;
  const subTotal = sumaVentas(t, false);
  const montoTotal = subTotal.mas(t.iva);
  return {
    identificacion: identificacion(d),
    documentoRelacionado: null,
    emisor: emisor(d.empresa, d.sucursal, true),
    receptor: receptorContribuyente(d.receptor),
    otrosDocumentos: null,
    ventaTercero: null,
    cuerpoDocumento: d.lineas.map((l, i) => ({
      ...item(l, i),
      tributos: l.clase === "gravada" ? ["20"] : null,
      psv: 0,
      noGravado: 0,
    })),
    resumen: {
      totalNoSuj: n(t.totalNoSujeto),
      totalExenta: n(t.totalExento),
      totalGravada: n(t.totalGravado),
      subTotalVentas: n(subTotal),
      descuNoSuj: 0,
      descuExenta: 0,
      descuGravada: 0,
      porcentajeDescuento: 0,
      totalDescu: 0,
      tributos: tributoIva(t.iva),
      subTotal: n(subTotal),
      ivaPerci1: n(t.ivaPercibido),
      ivaRete1: n(t.ivaRetenido),
      reteRenta: 0,
      montoTotalOperacion: n(montoTotal),
      totalNoGravado: 0,
      totalPagar: n(t.totalNeto),
      totalLetras: totalEnLetras(t.totalNeto),
      saldoFavor: 0,
      condicionOperacion: d.condicionPago === "contado" ? 1 : 2,
      pagos: pagos(d.condicionPago, t.totalNeto, d.diasCredito),
      numPagoElectronico: null,
    },
    extension: null,
    apendice: apendice(d.observaciones),
  };
}

/** Nota de crédito (05) o de débito (06): referencia al CCF electrónico que corrige. */
function nota(d: DatosEmisionDte) {
  if (!d.receptor) throw new ReglaDteError("La nota necesita el cliente del documento original.");
  if (!d.relacionado) throw new ReglaDteError("La nota debe referenciar el documento que corrige.");
  const t = d.totales;
  const subTotal = sumaVentas(t, false);
  const montoTotal = subTotal.mas(t.iva).mas(t.ivaPercibido).menos(t.ivaRetenido);
  return {
    identificacion: identificacion(d),
    documentoRelacionado: [
      {
        tipoDocumento: d.relacionado.tipo,
        // CAT-007: 2 documento electrónico
        tipoGeneracion: 2,
        numeroDocumento: d.relacionado.codigoGeneracion,
        fechaEmision: d.relacionado.fecha,
      },
    ],
    emisor: emisor(d.empresa, d.sucursal, false),
    receptor: receptorContribuyente(d.receptor),
    ventaTercero: null,
    cuerpoDocumento: d.lineas.map((l, i) => ({
      ...item(l, i),
      numeroDocumento: d.relacionado!.codigoGeneracion,
      tributos: l.clase === "gravada" ? ["20"] : null,
    })),
    resumen: {
      totalNoSuj: n(t.totalNoSujeto),
      totalExenta: n(t.totalExento),
      totalGravada: n(t.totalGravado),
      subTotalVentas: n(subTotal),
      descuNoSuj: 0,
      descuExenta: 0,
      descuGravada: 0,
      totalDescu: 0,
      tributos: tributoIva(t.iva),
      subTotal: n(subTotal),
      ivaPerci1: n(t.ivaPercibido),
      ivaRete1: n(t.ivaRetenido),
      reteRenta: 0,
      montoTotalOperacion: n(montoTotal),
      totalLetras: totalEnLetras(montoTotal.aTexto()),
      condicionOperacion: d.condicionPago === "contado" ? 1 : 2,
      ...(d.tipo === TIPOS_DTE.notaDebito ? { numPagoElectronico: null } : {}),
    },
    extension: null,
    apendice: apendice(d.observaciones),
  };
}

/** Arma el JSON del DTE según su tipo (sin firmar). */
export function construirDte(d: DatosEmisionDte): Record<string, unknown> {
  switch (d.tipo) {
    case TIPOS_DTE.factura:
      return factura(d);
    case TIPOS_DTE.ccf:
      return ccf(d);
    default:
      return nota(d);
  }
}

// ───────────────────────────── Invalidación ─────────────────────────────

/** CAT-024: 1 error en la información, 2 rescindir la operación, 3 otro. */
export type TipoInvalidacion = 1 | 2 | 3;

export interface DatosInvalidacion {
  codigoGeneracion: string;
  fecha: string;
  hora: string;
  empresa: EmpresaEmisora;
  sucursal: SucursalEmisora;
  responsable: { nombre: string };
  tipoInvalidacion: TipoInvalidacion;
  motivo: string;
  documento: {
    tipo: TipoDte;
    codigoGeneracion: string;
    selloRecibido: string;
    numeroControl: string;
    fecha: string;
    montoIva: string;
    receptor: TerceroReceptor | null;
  };
}

/** Evento de invalidación (anulación, versión 2) de un DTE ya recibido. */
export function construirInvalidacion(d: DatosInvalidacion): Record<string, unknown> {
  const receptor = d.documento.receptor;
  const nitEmpresa = soloDigitos(d.empresa.nit);
  return {
    identificacion: {
      version: 2,
      ambiente: AMBIENTE_PRUEBAS,
      codigoGeneracion: d.codigoGeneracion,
      fecAnula: d.fecha,
      horAnula: d.hora,
    },
    emisor: {
      nit: nitEmpresa,
      nombre: d.empresa.nombre,
      tipoEstablecimiento: d.sucursal.esMatriz ? "02" : "01",
      nomEstablecimiento: d.empresa.nombreComercial ?? d.empresa.nombre,
      codEstableMH: null,
      codEstable: d.sucursal.codigoEstablecimiento,
      codPuntoVentaMH: null,
      codPuntoVenta: d.sucursal.codigoPuntoVenta,
      telefono: d.empresa.telefono,
      correo: d.empresa.correo!,
    },
    documento: {
      tipoDte: d.documento.tipo,
      codigoGeneracion: d.documento.codigoGeneracion,
      selloRecibido: d.documento.selloRecibido,
      numeroControl: d.documento.numeroControl,
      fecEmi: d.documento.fecha,
      montoIva: n(d.documento.montoIva),
      // Solo un error en la información (tipo 1) se reemplaza por otro DTE
      codigoGeneracionR: null,
      tipoDocumento: receptor ? "36" : null,
      numDocumento: receptor ? soloDigitos(receptor.nit) : null,
      nombre: receptor?.nombre ?? null,
      telefono: receptor?.telefono && receptor.telefono.length >= 8 ? receptor.telefono : null,
      correo: receptor?.correo ?? null,
    },
    motivo: {
      tipoAnulacion: d.tipoInvalidacion,
      motivoAnulacion: d.motivo.slice(0, 250),
      nombreResponsable: d.responsable.nombre.slice(0, 100),
      tipDocResponsable: "36",
      numDocResponsable: nitEmpresa,
      nombreSolicita: d.responsable.nombre.slice(0, 100),
      tipDocSolicita: "36",
      numDocSolicita: nitEmpresa,
    },
  };
}
