import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { TipoDte } from "./dte.js";

/**
 * Esquemas JSON de los DTE transcritos de los publicados por el Ministerio de Hacienda (fe-fc-v1, fe-ccf-v3,
 * fe-nc-v3, fe-nd-v3 y anulacion-schema-v2): estructura, campos obligatorios, patrones de los códigos y rangos de
 * los montos. Todo DTE se valida con ajv antes de firmarse; uno que no cumple no se emite.
 */

type Esquema = Record<string, unknown>;

const nulo = (tipo: Esquema): Esquema => ({ anyOf: [tipo, { type: "null" }] });
const texto = (min: number, max: number, extra: Esquema = {}): Esquema => ({
  type: "string",
  minLength: min,
  maxLength: max,
  ...extra,
});
const patron = (pattern: string): Esquema => ({ type: "string", pattern });
const monto = (maximo = 100_000_000_000): Esquema => ({
  type: "number",
  minimum: 0,
  exclusiveMaximum: maximo,
  multipleOf: 0.01,
});
const montoPrecio: Esquema = {
  type: "number",
  minimum: 0,
  exclusiveMaximum: 100_000_000_000,
  multipleOf: 0.00000001,
};
const cerrado = (properties: Record<string, Esquema>, opcionales: string[] = []): Esquema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties).filter((k) => !opcionales.includes(k)),
  properties,
});

const NIT = patron("^([0-9]{14}|[0-9]{9})$");
const NRC = patron("^[0-9]{1,8}$");
const CODIGO_GENERACION = patron("^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$");
const FECHA: Esquema = { type: "string", format: "date" };
const HORA = patron("^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$");
const TELEFONO = texto(8, 30);
const CORREO = texto(3, 100, { format: "email" });
const DIRECCION = cerrado({
  departamento: patron("^(0[1-9]|1[0-4])$"),
  municipio: patron("^[0-9]{2}$"),
  complemento: texto(1, 200),
});
const ACTIVIDAD = patron("^[0-9]{2,6}$");

const identificacion = (version: number, tipo: TipoDte): Esquema =>
  cerrado({
    version: { const: version },
    ambiente: { enum: ["00", "01"] },
    tipoDte: { const: tipo },
    numeroControl: patron(`^DTE-${tipo}-[A-Z0-9]{8}-[0-9]{15}$`),
    codigoGeneracion: CODIGO_GENERACION,
    tipoModelo: { enum: [1, 2] },
    tipoOperacion: { enum: [1, 2] },
    tipoContingencia: nulo({ enum: [1, 2, 3, 4, 5] }),
    motivoContin: nulo(texto(1, 150)),
    fecEmi: FECHA,
    horEmi: HORA,
    tipoMoneda: { const: "USD" },
  });

const emisorBase = {
  nit: NIT,
  nrc: NRC,
  nombre: texto(1, 250),
  codActividad: ACTIVIDAD,
  descActividad: texto(1, 150),
  nombreComercial: nulo(texto(1, 150)),
  tipoEstablecimiento: { enum: ["01", "02", "04", "07", "20"] },
  direccion: DIRECCION,
  telefono: TELEFONO,
  correo: CORREO,
};
const emisorConEstablecimiento = cerrado({
  ...emisorBase,
  codEstableMH: nulo(texto(4, 4)),
  codEstable: nulo(texto(1, 10)),
  codPuntoVentaMH: nulo(texto(4, 4)),
  codPuntoVenta: nulo(texto(1, 15)),
});

const receptorContribuyente = cerrado({
  nit: NIT,
  nrc: NRC,
  nombre: texto(1, 250),
  codActividad: ACTIVIDAD,
  descActividad: texto(1, 150),
  nombreComercial: nulo(texto(1, 150)),
  direccion: DIRECCION,
  telefono: nulo(TELEFONO),
  correo: nulo(CORREO),
});

const receptorFactura = cerrado({
  tipoDocumento: nulo({ enum: ["36", "13", "02", "03", "37"] }),
  numDocumento: nulo(texto(3, 20)),
  nrc: nulo(NRC),
  nombre: nulo(texto(1, 250)),
  codActividad: nulo(ACTIVIDAD),
  descActividad: nulo(texto(1, 150)),
  direccion: nulo(DIRECCION),
  telefono: nulo(TELEFONO),
  correo: nulo(CORREO),
});

const itemBase = {
  numItem: { type: "integer", minimum: 1, maximum: 2000 },
  tipoItem: { enum: [1, 2, 3, 4] },
  numeroDocumento: nulo(texto(1, 36)),
  cantidad: {
    type: "number",
    exclusiveMinimum: 0,
    exclusiveMaximum: 100_000_000_000,
    multipleOf: 0.00000001,
  },
  codigo: nulo(texto(1, 25)),
  codTributo: { type: "null" },
  uniMedida: { type: "integer", minimum: 1, maximum: 99 },
  descripcion: texto(1, 1000),
  precioUni: montoPrecio,
  montoDescu: monto(),
  ventaNoSuj: monto(),
  ventaExenta: monto(),
  ventaGravada: monto(),
  tributos: nulo({ type: "array", minItems: 1, items: patron("^[0-9A-Z]{2}$") }),
};

const tributosResumen = nulo({
  type: "array",
  minItems: 1,
  items: cerrado({ codigo: patron("^[0-9A-Z]{2}$"), descripcion: texto(2, 150), valor: monto() }),
});

const pagos = nulo({
  type: "array",
  minItems: 1,
  items: cerrado({
    codigo: patron("^(0[1-9]|1[0-4]|99)$"),
    montoPago: monto(),
    referencia: nulo(texto(1, 50)),
    plazo: nulo(patron("^0[1-3]$")),
    periodo: nulo({ type: "number" }),
  }),
});

const apendice = nulo({
  type: "array",
  minItems: 1,
  maxItems: 10,
  items: cerrado({ campo: texto(2, 25), etiqueta: texto(3, 50), valor: texto(1, 150) }),
});

const extension = nulo({ type: "object" });
const documentoRelacionadoCcf = {
  type: "array",
  minItems: 1,
  maxItems: 50,
  items: cerrado({
    tipoDocumento: { enum: ["03", "07"] },
    tipoGeneracion: { enum: [1, 2] },
    numeroDocumento: texto(1, 36),
    fechaEmision: FECHA,
  }),
};

const condicion = { enum: [1, 2, 3] };

/** fe-fc-v1: factura de consumidor final. */
const FACTURA = cerrado({
  identificacion: identificacion(1, "01"),
  documentoRelacionado: { type: "null" },
  emisor: emisorConEstablecimiento,
  receptor: receptorFactura,
  otrosDocumentos: { type: "null" },
  ventaTercero: { type: "null" },
  cuerpoDocumento: {
    type: "array",
    minItems: 1,
    maxItems: 2000,
    items: cerrado({ ...itemBase, psv: monto(), noGravado: { type: "number" }, ivaItem: monto() }),
  },
  resumen: cerrado({
    totalNoSuj: monto(),
    totalExenta: monto(),
    totalGravada: monto(),
    subTotalVentas: monto(),
    descuNoSuj: monto(),
    descuExenta: monto(),
    descuGravada: monto(),
    porcentajeDescuento: { type: "number", minimum: 0, maximum: 100 },
    totalDescu: monto(),
    tributos: tributosResumen,
    subTotal: monto(),
    ivaRete1: monto(),
    reteRenta: monto(),
    montoTotalOperacion: monto(),
    totalNoGravado: { type: "number" },
    totalPagar: monto(),
    totalLetras: texto(1, 200),
    totalIva: monto(),
    saldoFavor: { type: "number", maximum: 0 },
    condicionOperacion: condicion,
    pagos,
    numPagoElectronico: nulo(texto(1, 100)),
  }),
  extension,
  apendice,
});

/** fe-ccf-v3: comprobante de crédito fiscal. */
const CCF = cerrado({
  identificacion: identificacion(3, "03"),
  documentoRelacionado: { type: "null" },
  emisor: emisorConEstablecimiento,
  receptor: receptorContribuyente,
  otrosDocumentos: { type: "null" },
  ventaTercero: { type: "null" },
  cuerpoDocumento: {
    type: "array",
    minItems: 1,
    maxItems: 2000,
    items: cerrado({ ...itemBase, psv: monto(), noGravado: { type: "number" } }),
  },
  resumen: cerrado({
    totalNoSuj: monto(),
    totalExenta: monto(),
    totalGravada: monto(),
    subTotalVentas: monto(),
    descuNoSuj: monto(),
    descuExenta: monto(),
    descuGravada: monto(),
    porcentajeDescuento: { type: "number", minimum: 0, maximum: 100 },
    totalDescu: monto(),
    tributos: tributosResumen,
    subTotal: monto(),
    ivaPerci1: monto(),
    ivaRete1: monto(),
    reteRenta: monto(),
    montoTotalOperacion: monto(),
    totalNoGravado: { type: "number" },
    totalPagar: monto(),
    totalLetras: texto(1, 200),
    saldoFavor: { type: "number", maximum: 0 },
    condicionOperacion: condicion,
    pagos,
    numPagoElectronico: nulo(texto(1, 100)),
  }),
  extension,
  apendice,
});

const resumenNota = (conPagoElectronico: boolean) =>
  cerrado({
    totalNoSuj: monto(),
    totalExenta: monto(),
    totalGravada: monto(),
    subTotalVentas: monto(),
    descuNoSuj: monto(),
    descuExenta: monto(),
    descuGravada: monto(),
    totalDescu: monto(),
    tributos: tributosResumen,
    subTotal: monto(),
    ivaPerci1: monto(),
    ivaRete1: monto(),
    reteRenta: monto(),
    montoTotalOperacion: monto(),
    totalLetras: texto(1, 200),
    condicionOperacion: condicion,
    ...(conPagoElectronico ? { numPagoElectronico: nulo(texto(1, 100)) } : {}),
  });

const nota = (tipo: "05" | "06") =>
  cerrado({
    identificacion: identificacion(3, tipo),
    documentoRelacionado: documentoRelacionadoCcf,
    emisor: cerrado(emisorBase),
    receptor: receptorContribuyente,
    ventaTercero: { type: "null" },
    cuerpoDocumento: {
      type: "array",
      minItems: 1,
      maxItems: 2000,
      items: cerrado({ ...itemBase, numeroDocumento: texto(1, 36) }),
    },
    resumen: resumenNota(tipo === "06"),
    extension,
    apendice,
  });

const ajv = new Ajv({ allErrors: true, strict: true, multipleOfPrecision: 6 });
addFormats.default(ajv, ["date", "email"]);

const VALIDADORES: Partial<Record<TipoDte | "invalidacion", ValidateFunction>> = {
  "01": ajv.compile(FACTURA),
  "03": ajv.compile(CCF),
  "05": ajv.compile(nota("05")),
  "06": ajv.compile(nota("06")),
};

/** El DTE no cumple el esquema de Hacienda: no se firma ni se emite. */
export class DteInvalidoError extends Error {
  constructor(readonly errores: string[]) {
    super(`El documento no cumple el esquema de Hacienda: ${errores.slice(0, 3).join("; ")}.`);
  }
}

const describir = (e: ErrorObject) => `${e.instancePath || "/"} ${e.message ?? "no es válido"}`;

/** Errores del documento contra su esquema (vacío si es válido). */
export function erroresEsquema(tipo: TipoDte | "invalidacion", documento: unknown): string[] {
  const validar = VALIDADORES[tipo];
  if (!validar) return [`no hay esquema para el documento ${tipo}`];
  return validar(documento) ? [] : (validar.errors ?? []).map(describir);
}

export function exigirEsquema(tipo: TipoDte | "invalidacion", documento: unknown): void {
  const errores = erroresEsquema(tipo, documento);
  if (errores.length > 0) throw new DteInvalidoError(errores);
}
