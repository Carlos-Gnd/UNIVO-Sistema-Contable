import { z } from "zod";
import { editable, fechaSchema, idSchema, opcional, textoOpcionalSchema, textoSchema } from "./comunes";
import { clasificacionContribuyenteSchema, type ClasificacionContribuyente } from "./enums";
import { cantidadSchema, costoUnitarioSchema, numeroSerieSchema } from "./inventario";
import { nitSchema, nrcSchema } from "./organizacion";

const correoSchema = z.email({ error: "Correo inválido." }).max(150, { error: "Máximo 150 caracteres." });
const textoCorto = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, { error: `Máximo ${maximo} caracteres.` });

const diasCreditoSchema = z.coerce
  .number({ error: "Los días de crédito deben ser un número." })
  .int({ error: "Los días de crédito deben ser un número entero." })
  .min(0, { error: "Los días de crédito no pueden ser negativos." })
  .max(365, { error: "Máximo 365 días de crédito." });

const MENSAJE_ROL = "Marca al menos una opción: cliente o proveedor.";

/** Alta de un cliente o proveedor (HU-58): NIT con dígito verificador, NRC con formato y clasificación. */
export const crearTerceroSchema = z
  .object({
    nombre: textoSchema(200),
    nit: nitSchema,
    nrc: opcional(nrcSchema),
    actividadEconomica: textoOpcionalSchema(200),
    clasificacion: clasificacionContribuyenteSchema.default("otro"),
    direccion: textoOpcionalSchema(300),
    telefono: textoOpcionalSchema(20),
    correo: opcional(correoSchema),
    esCliente: z.boolean().default(false),
    esProveedor: z.boolean().default(false),
    diasCredito: diasCreditoSchema.default(0),
  })
  .refine((t) => t.esCliente || t.esProveedor, { error: MENSAJE_ROL, path: ["esCliente"] });
export type CrearTercero = z.infer<typeof crearTerceroSchema>;

/** Edita los campos enviados; null o vacío borra un dato opcional y { activo: false } lo inactiva. */
export const editarTerceroSchema = z
  .object({
    nombre: textoSchema(200).optional(),
    nit: nitSchema.optional(),
    nrc: editable(nrcSchema),
    actividadEconomica: editable(textoCorto(200)),
    clasificacion: clasificacionContribuyenteSchema.optional(),
    direccion: editable(textoCorto(300)),
    telefono: editable(textoCorto(20)),
    correo: editable(correoSchema),
    esCliente: z.boolean().optional(),
    esProveedor: z.boolean().optional(),
    diasCredito: diasCreditoSchema.optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: "No hay cambios que guardar." });
export type EditarTercero = z.infer<typeof editarTerceroSchema>;

export interface TerceroVista {
  id: string;
  nombre: string;
  nit: string;
  nrc: string | null;
  actividadEconomica: string | null;
  clasificacion: ClasificacionContribuyente;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  diasCredito: number;
  activo: boolean;
}

/** Filtros de la lista: ?rol=cliente|proveedor, ?busqueda (nombre, NIT o NRC) y ?activo=true|false. */
export const ROLES_TERCERO = ["cliente", "proveedor"] as const;
export const rolTerceroSchema = z.enum(ROLES_TERCERO);
export type RolTercero = z.infer<typeof rolTerceroSchema>;

// ───────────── Documentos de compra y venta (HU-59, HU-60) ─────────────

export const CLASES_GRAVAMEN = ["gravada", "exenta", "no_sujeta"] as const;
export const claseGravamenSchema = z.enum(CLASES_GRAVAMEN);
export const condicionPagoSchema = z.enum(["contado", "credito"]);
export type CondicionPago = z.infer<typeof condicionPagoSchema>;
export const OPERACIONES_COMERCIALES = ["compra", "venta"] as const;
export const operacionComercialSchema = z.enum(OPERACIONES_COMERCIALES);
export const tipoDocumentoComercialSchema = z.enum(["ccf", "factura", "exportacion"]);

/** Una línea del documento: un producto del inventario o una cuenta contable de gasto, activo o ingreso. */
export const lineaDocumentoSchema = z
  .object({
    productoId: opcional(idSchema),
    cuentaId: opcional(idSchema),
    descripcion: textoOpcionalSchema(200),
    cantidad: cantidadSchema.refine((c) => Number(c) > 0, { error: "La cantidad debe ser mayor que cero." }),
    /** Precio por unidad como figura en el documento (hasta cuatro decimales) */
    precioUnitario: costoUnitarioSchema,
    clase: claseGravamenSchema.default("gravada"),
    /** Series o IMEI de las unidades; solo para productos controlados por serie */
    series: z.array(numeroSerieSchema).optional(),
  })
  .refine((l) => (l.productoId === undefined) !== (l.cuentaId === undefined), {
    path: ["productoId"],
    error: "Elige un producto o una cuenta contable, no ambos.",
  });
export type LineaDocumento = z.infer<typeof lineaDocumentoSchema>;

const datosDocumento = {
  sucursalId: idSchema,
  numeroDocumento: textoSchema(60),
  fecha: fechaSchema,
  condicionPago: condicionPagoSchema,
  /** Cuenta de efectivo (caja o banco) del pago o cobro al contado */
  cuentaPagoId: opcional(idSchema),
  /** Plazo de un documento al crédito; sin él se usa el del cliente o proveedor */
  diasCredito: opcional(diasCreditoSchema),
  observaciones: textoOpcionalSchema(300),
  lineas: z.array(lineaDocumentoSchema).min(1, { error: "Agrega al menos una línea." }).max(200),
};

function exigirContado<T extends { condicionPago: CondicionPago; cuentaPagoId?: string | undefined }>(
  d: T,
  ctx: z.RefinementCtx,
) {
  if (d.condicionPago === "contado" && d.cuentaPagoId === undefined) {
    ctx.addIssue({ code: "custom", path: ["cuentaPagoId"], message: "Elige la caja o el banco del pago." });
  }
}

/** Compra: documento del proveedor (CCF o factura) con proveedor obligatorio. */
export const crearCompraSchema = z
  .object({
    ...datosDocumento,
    tipoDocumento: z.enum(["ccf", "factura"]),
    terceroId: idSchema,
  })
  .superRefine(exigirContado);
export type CrearCompra = z.infer<typeof crearCompraSchema>;

/** Venta: CCF a un contribuyente, factura de consumidor final (cliente opcional) o exportación. */
export const crearVentaSchema = z
  .object({
    ...datosDocumento,
    tipoDocumento: tipoDocumentoComercialSchema,
    terceroId: opcional(idSchema),
    /** Último número de un resumen de facturas de consumidor final (del número_documento al último) */
    numeroDocumentoHasta: opcional(textoSchema(60)),
  })
  .superRefine(exigirContado)
  .superRefine((d, ctx) => {
    if (d.tipoDocumento === "ccf" && d.terceroId === undefined) {
      ctx.addIssue({ code: "custom", path: ["terceroId"], message: "Un CCF necesita el cliente." });
    }
    if (d.numeroDocumentoHasta !== undefined && d.tipoDocumento !== "factura") {
      ctx.addIssue({
        code: "custom",
        path: ["numeroDocumentoHasta"],
        message: "El rango de números es solo para el resumen de facturas de consumidor final.",
      });
    }
    if (d.condicionPago === "credito" && d.terceroId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["terceroId"],
        message: "Una venta al crédito necesita el cliente.",
      });
    }
  });
export type CrearVenta = z.infer<typeof crearVentaSchema>;

export interface LineaDocumentoVista {
  orden: number;
  productoId: string | null;
  productoCodigo: string | null;
  cuentaId: string | null;
  descripcion: string;
  clase: z.infer<typeof claseGravamenSchema>;
  cantidad: string;
  precioUnitario: string;
  monto: string;
  /** Costo de venta o de entrada que tomó el kardex en la línea */
  costoKardex: string | null;
}

export interface DocumentoComercialVista {
  id: string;
  operacion: z.infer<typeof operacionComercialSchema>;
  tipoDocumento: z.infer<typeof tipoDocumentoComercialSchema>;
  numeroDocumento: string;
  /** Último número de un resumen de facturas de consumidor final */
  numeroDocumentoHasta: string | null;
  fecha: string;
  sucursalId: string;
  tercero: { id: string; nombre: string; nit: string; nrc: string | null } | null;
  condicionPago: CondicionPago;
  cuentaPagoId: string | null;
  diasCredito: number;
  fechaVencimiento: string | null;
  totalGravado: string;
  totalExento: string;
  totalNoSujeto: string;
  iva: string;
  ivaPercibido: string;
  ivaRetenido: string;
  total: string;
  totalNeto: string;
  /** Partida que contabiliza el documento; nace en borrador */
  partidaId: string;
  estadoPartida: "borrador" | "contabilizada" | "anulada";
  /** Partida del costo de ventas (solo ventas con inventario perpetuo) */
  partidaCostoId: string | null;
  observaciones: string | null;
  lineas: LineaDocumentoVista[];
}

/** Resumen de una fila de la lista de compras o ventas. */
export type DocumentoComercialResumen = Omit<DocumentoComercialVista, "lineas">;

export const consultaDocumentosSchema = z.object({
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  terceroId: idSchema.optional(),
  /** Texto contenido en el número del documento o el nombre del tercero */
  busqueda: z.string().trim().max(100).optional(),
});
export type ConsultaDocumentos = z.infer<typeof consultaDocumentosSchema>;
