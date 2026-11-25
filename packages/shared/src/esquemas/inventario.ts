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
  controlaSeries: z.boolean().default(false),
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
    controlaSeries: z.boolean().optional(),
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
  controlaSeries: boolean;
  /** Método propio del producto; null usa el de la empresa */
  metodoValuacion: MetodoValuacion | null;
  activo: boolean;
}

export const TIPOS_MOVIMIENTO = ["entrada", "salida"] as const;
export const tipoMovimientoSchema = z.enum(TIPOS_MOVIMIENTO);
export type TipoMovimientoInventario = z.infer<typeof tipoMovimientoSchema>;

/** Identificador de serie o IMEI, recortado y normalizado para evitar duplicados por mayúsculas. */
export const numeroSerieSchema = textoSchema(100).transform((numero) => numero.toUpperCase());

const listaSeriesSchema = z.array(numeroSerieSchema).superRefine((series, contexto) => {
  if (new Set(series).size !== series.length) {
    contexto.addIssue({ code: "custom", message: "No repitas una serie en el mismo movimiento." });
  }
});

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
    series: listaSeriesSchema.optional(),
  })
  .refine((m) => m.tipo === "salida" || m.costoUnitario !== undefined, {
    path: ["costoUnitario"],
    error: "Una entrada necesita su costo unitario.",
  });
export type CrearMovimiento = z.infer<typeof crearMovimientoSchema>;

export const consultaSeriesSchema = z.object({
  sucursalId: idSchema,
  estado: z.enum(["todas", "en_existencia", "vendidas"]).default("todas"),
});
export type ConsultaSeries = z.infer<typeof consultaSeriesSchema>;

export interface SerieInventarioVista {
  id: string;
  productoId: string;
  sucursalId: string;
  numeroSerie: string;
  costoUnitario: string;
  estado: "en_existencia" | "vendida";
  fechaEntrada: string;
  fechaSalida: string | null;
}

/** Producto cuya existencia llegó o cayó por debajo del punto de reorden en una sucursal. */
export interface ProductoReabastecimientoVista {
  productoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  sucursalId: string;
  existenciaActual: string;
  existenciaMinima: string;
  cantidadFaltante: string;
}

export const crearTomaFisicaSchema = z.object({ sucursalId: idSchema, fecha: fechaSchema });
export type CrearTomaFisica = z.infer<typeof crearTomaFisicaSchema>;

const lineaConteoTomaFisicaSchema = z.object({
  productoId: idSchema,
  cantidadContada: cantidadSchema,
  seriesContadas: listaSeriesSchema.optional(),
});

export const guardarConteoTomaFisicaSchema = z.object({
  lineas: z
    .array(lineaConteoTomaFisicaSchema)
    .min(1)
    .superRefine((lineas, contexto) => {
      if (new Set(lineas.map((linea) => linea.productoId)).size !== lineas.length) {
        contexto.addIssue({ code: "custom", message: "No repitas un producto en el conteo." });
      }
    }),
});
export type GuardarConteoTomaFisica = z.infer<typeof guardarConteoTomaFisicaSchema>;

export const aprobarTomaFisicaSchema = z
  .object({
    cuentaFaltantesId: idSchema.nullable().optional(),
    cuentaSobrantesId: idSchema.nullable().optional(),
    costosSobrantes: z
      .array(z.object({ productoId: idSchema, costoUnitario: costoUnitarioSchema }))
      .default([]),
  })
  .superRefine((datos, contexto) => {
    if (
      new Set(datos.costosSobrantes.map((costo) => costo.productoId)).size !== datos.costosSobrantes.length
    ) {
      contexto.addIssue({ code: "custom", message: "No repitas el costo de un producto." });
    }
  });
export type AprobarTomaFisica = z.infer<typeof aprobarTomaFisicaSchema>;

export interface DetalleTomaFisicaVista {
  productoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  controlaSeries: boolean;
  existenciaSistema: string;
  cantidadContada: string | null;
  diferencia: string | null;
  cantidadFaltante: string | null;
  cantidadSobrante: string | null;
  seriesContadas: string[] | null;
  valorFaltante: string | null;
  valorSobrante: string | null;
  valorFinal: string | null;
}

export interface TomaFisicaVista {
  id: string;
  sucursalId: string;
  fecha: string;
  estado: "en_conteo" | "aprobada";
  partidaId: string | null;
  creadoEn: string;
  aprobadoEn: string | null;
  detalles: DetalleTomaFisicaVista[];
  resumen: {
    productosConDiferencia: number;
    cantidadFaltante: string;
    cantidadSobrante: string;
    valorFaltante: string;
    valorSobrante: string | null;
  };
}

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

/** Cierre analítico: compras y rebajas vienen de partidas, el inventario final de la última toma aprobada. */
export const consultaInventarioAnaliticoSchema = z
  .object({
    desde: fechaSchema,
    hasta: fechaSchema,
    sucursalId: idSchema.optional(),
  })
  .refine((consulta) => consulta.hasta >= consulta.desde, {
    path: ["hasta"],
    error: "La fecha final debe ser igual o posterior a la inicial.",
  });
export type ConsultaInventarioAnalitico = z.infer<typeof consultaInventarioAnaliticoSchema>;

export interface InventarioAnaliticoVista {
  desde: string;
  hasta: string;
  sucursalId: string | null;
  inventarioInicial: string;
  compras: string;
  gastosSobreCompras: string;
  devolucionesYRebajas: string;
  comprasNetas: string;
  inventarioFinal: string | null;
  costoVentas: string | null;
  inventarioFinalPorSucursal: {
    sucursalId: string;
    sucursal: string;
    fechaToma: string | null;
    valor: string | null;
  }[];
}

/** Kardex de un producto en una sucursal: entradas, salidas y saldo en unidades y valores (HU-65). */
export interface KardexVista {
  productoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  sucursalId: string;
  metodo: MetodoValuacion | "especifico";
  desde: string | null;
  hasta: string | null;
  saldoInicial: SaldoExistencias;
  lineas: LineaKardex[];
  totales: { entradaCantidad: string; entradaTotal: string; salidaCantidad: string; salidaTotal: string };
  saldoFinal: SaldoExistencias;
}
export type { DetalleKardex, LineaKardex, SaldoExistencias };
