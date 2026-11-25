import { z } from "zod";
import { editable, fechaSchema, idSchema, montoSchema, opcional, textoSchema } from "./comunes";
import { metodoValuacionSchema, type MetodoValuacion } from "./enums";
import type { DetalleKardex, LineaKardex, SaldoExistencias } from "../inventario/valuacion";

/** Unidades de medida frecuentes; el campo es libre para no limitar al comercio. */
export const UNIDAD_POR_DEFECTO = "unidad";

/** Código de producto: letras, dígitos y . _ - sin espacios (único por empresa). */
export const codigoProductoSchema = textoSchema(30).regex(/^[A-Za-z0-9._-]+$/, {
  error: "Usa solo letras, números, punto, guion y guion bajo.",
});

/** Cantidad de unidades: positiva o cero, hasta cuatro decimales; se normaliza a texto con cuatro decimales. */
export const cantidadSchema = z.union([z.string(), z.number()]).transform((valor, ctx) => {
  const texto = typeof valor === "number" ? String(valor) : valor.trim();
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(texto)) {
    ctx.addIssue({ code: "custom", message: "Cantidad inválida: usa hasta 4 decimales." });
    return z.NEVER;
  }
  return Number(texto).toFixed(4);
});

export const crearCategoriaSchema = z.object({ nombre: textoSchema(80) });
export type CrearCategoria = z.infer<typeof crearCategoriaSchema>;

export const editarCategoriaSchema = z
  .object({ nombre: textoSchema(80).optional(), activa: z.boolean().optional() })
  .refine((v) => v.nombre !== undefined || v.activa !== undefined, { error: "No hay cambios que guardar." });
export type EditarCategoria = z.infer<typeof editarCategoriaSchema>;

export interface CategoriaProducto {
  id: string;
  nombre: string;
  activa: boolean;
  /** Productos que pertenecen a la categoría */
  productos: number;
}

export const crearProductoSchema = z.object({
  codigo: codigoProductoSchema,
  nombre: textoSchema(150),
  categoriaId: opcional(idSchema),
  unidadMedida: opcional(textoSchema(20)),
  precioVenta: montoSchema.default("0.00"),
  existenciaMinima: cantidadSchema.default("0.0000"),
  /** Sin método, el producto usa el de la empresa */
  metodoValuacion: opcional(metodoValuacionSchema),
});
export type CrearProducto = z.infer<typeof crearProductoSchema>;

/** Edita los campos enviados; null en categoriaId quita la categoría y { activo: false } inactiva el producto. */
export const editarProductoSchema = z
  .object({
    codigo: codigoProductoSchema.optional(),
    nombre: textoSchema(150).optional(),
    categoriaId: editable(idSchema),
    unidadMedida: textoSchema(20).optional(),
    precioVenta: montoSchema.optional(),
    existenciaMinima: cantidadSchema.optional(),
    metodoValuacion: editable(metodoValuacionSchema),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: "No hay cambios que guardar." });
export type EditarProducto = z.infer<typeof editarProductoSchema>;

export interface ProductoVista {
  id: string;
  codigo: string;
  nombre: string;
  categoriaId: string | null;
  categoria: string | null;
  unidadMedida: string;
  /** Precio de venta sin IVA, con dos decimales */
  precioVenta: string;
  /** Cantidad mínima en existencia antes de reabastecer; 0.0000 si no se controla */
  existenciaMinima: string;
  /** Método propio del producto; null usa el de la empresa */
  metodoValuacion: MetodoValuacion | null;
  activo: boolean;
}

export const TIPOS_MOVIMIENTO = ["entrada", "salida"] as const;
export const tipoMovimientoSchema = z.enum(TIPOS_MOVIMIENTO);
export type TipoMovimientoInventario = z.infer<typeof tipoMovimientoSchema>;

/** Costo unitario de una entrada: no negativo, hasta cuatro decimales. */
export const costoUnitarioSchema = z.union([z.string(), z.number()]).transform((valor, ctx) => {
  const texto = typeof valor === "number" ? String(valor) : valor.trim();
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(texto)) {
    ctx.addIssue({ code: "custom", message: "Costo inválido: usa hasta 4 decimales." });
    return z.NEVER;
  }
  return Number(texto).toFixed(4);
});

/**
 * Entrada o salida de un producto en una sucursal. Una entrada lleva el costo unitario de la compra; el costo de
 * una salida lo calcula el sistema con el método de valuación. No se registran movimientos anteriores al último
 * del producto en la sucursal.
 */
export const crearMovimientoSchema = z
  .object({
    productoId: idSchema,
    sucursalId: idSchema,
    fecha: fechaSchema,
    tipo: tipoMovimientoSchema,
    cantidad: cantidadSchema.refine((c) => Number(c) > 0, { error: "La cantidad debe ser mayor que cero." }),
    costoUnitario: opcional(costoUnitarioSchema),
    referencia: opcional(textoSchema(60)),
  })
  .refine((m) => m.tipo === "salida" || m.costoUnitario !== undefined, {
    path: ["costoUnitario"],
    error: "Una entrada necesita su costo unitario.",
  });
export type CrearMovimiento = z.infer<typeof crearMovimientoSchema>;

export interface MovimientoInventarioVista {
  id: string;
  productoId: string;
  sucursalId: string;
  fecha: string;
  tipo: TipoMovimientoInventario;
  cantidad: string;
  costoUnitario: string;
  costoTotal: string;
  referencia: string | null;
  /** Existencias después del movimiento */
  saldo: SaldoExistencias;
}

export const consultaKardexSchema = z.object({
  sucursalId: idSchema,
  desde: opcional(fechaSchema),
  hasta: opcional(fechaSchema),
});
export type ConsultaKardex = z.infer<typeof consultaKardexSchema>;

/** Kardex de un producto en una sucursal: entradas, salidas y saldo en unidades y valores (HU-65). */
export interface KardexVista {
  productoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  sucursalId: string;
  metodo: MetodoValuacion;
  desde: string | null;
  hasta: string | null;
  saldoInicial: SaldoExistencias;
  lineas: LineaKardex[];
  totales: { entradaCantidad: string; entradaTotal: string; salidaCantidad: string; salidaTotal: string };
  saldoFinal: SaldoExistencias;
}
export type { DetalleKardex, LineaKardex, SaldoExistencias };
