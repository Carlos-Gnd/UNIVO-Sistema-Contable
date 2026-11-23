import { z } from "zod";
import { editable, idSchema, montoSchema, opcional, textoSchema } from "./comunes";

/** Unidades de medida frecuentes; el campo es libre para no limitar al comercio. */
export const UNIDAD_POR_DEFECTO = "unidad";

/** Código de producto: letras, dígitos y . _ - sin espacios (único por empresa). */
export const codigoProductoSchema = textoSchema(30).regex(/^[A-Za-z0-9._-]+$/, {
  error: "Usa solo letras, números, punto, guion y guion bajo.",
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
  activo: boolean;
}
