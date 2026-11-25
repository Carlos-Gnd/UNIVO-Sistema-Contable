import { z } from "zod";
import { fechaSchema, idSchema } from "./comunes";

/** Filtros de los libros de IVA (HU-45, HU-46 y HU-47): el período y la sucursal; sin sucursal, el libro es consolidado. */
export const consultaLibroIvaSchema = z
  .object({
    desde: fechaSchema,
    hasta: fechaSchema,
    sucursalId: idSchema.optional(),
  })
  .refine((c) => c.desde <= c.hasta, {
    error: "La fecha inicial no puede ser posterior a la final.",
    path: ["desde"],
  });
export type ConsultaLibroIva = z.infer<typeof consultaLibroIvaSchema>;

/** Un renglón del libro de compras: un documento del proveedor (CCF o factura). Un documento anulado queda con montos en cero. */
export interface FilaLibroCompras {
  /** Número correlativo del renglón dentro del libro */
  numero: number;
  documentoId: string;
  /** AAAA-MM-DD */
  fecha: string;
  tipoDocumento: "ccf" | "factura";
  numeroDocumento: string;
  /** NRC del proveedor; nulo si no es contribuyente (el libro muestra N/A) */
  nrcProveedor: string | null;
  proveedor: string;
  concepto: string;
  sucursal: string;
  anulado: boolean;
  comprasExentas: string;
  comprasNoSujetas: string;
  comprasGravadas: string;
  creditoFiscal: string;
  ivaPercibido: string;
  ivaRetenido: string;
  totalCompras: string;
}

export interface TotalesLibroCompras {
  comprasExentas: string;
  comprasNoSujetas: string;
  comprasGravadas: string;
  creditoFiscal: string;
  ivaPercibido: string;
  ivaRetenido: string;
  totalCompras: string;
}

/** Libro de compras (Art. 141 del Código Tributario) del período. */
export interface LibroCompras {
  desde: string;
  hasta: string;
  filas: FilaLibroCompras[];
  totales: TotalesLibroCompras;
}
