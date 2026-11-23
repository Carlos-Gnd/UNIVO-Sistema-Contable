import { z } from "zod";
import { editable, idSchema, opcional, textoSchema } from "./comunes";

export const TIPOS_CUENTA_TESORERIA = ["caja", "banco"] as const;
export const tipoCuentaTesoreriaSchema = z.enum(TIPOS_CUENTA_TESORERIA);
export type TipoCuentaTesoreria = z.infer<typeof tipoCuentaTesoreriaSchema>;

/**
 * Caja o cuenta bancaria vinculada a una cuenta contable de efectivo (1101…) de último nivel. Un banco necesita
 * su entidad y su número de cuenta; una caja no los lleva. La sucursal es opcional: sin ella es de toda la empresa.
 */
export const crearCuentaTesoreriaSchema = z
  .object({
    tipo: tipoCuentaTesoreriaSchema,
    nombre: textoSchema(100),
    cuentaId: idSchema,
    sucursalId: opcional(idSchema),
    banco: opcional(textoSchema(80)),
    numeroCuenta: opcional(textoSchema(40)),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "banco") {
      if (!v.banco) ctx.addIssue({ code: "custom", path: ["banco"], message: "El banco es obligatorio." });
      if (!v.numeroCuenta)
        ctx.addIssue({
          code: "custom",
          path: ["numeroCuenta"],
          message: "El número de cuenta es obligatorio.",
        });
    } else if (v.banco || v.numeroCuenta) {
      ctx.addIssue({
        code: "custom",
        path: ["banco"],
        message: "Una caja no lleva banco ni número de cuenta.",
      });
    }
  });
export type CrearCuentaTesoreria = z.infer<typeof crearCuentaTesoreriaSchema>;

/** Edita los campos enviados; el tipo y la cuenta contable no cambian. { activa: false } la inactiva. */
export const editarCuentaTesoreriaSchema = z
  .object({
    nombre: textoSchema(100).optional(),
    banco: textoSchema(80).optional(),
    numeroCuenta: textoSchema(40).optional(),
    sucursalId: editable(idSchema),
    activa: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: "No hay cambios que guardar." });
export type EditarCuentaTesoreria = z.infer<typeof editarCuentaTesoreriaSchema>;

export interface CuentaTesoreriaVista {
  id: string;
  tipo: TipoCuentaTesoreria;
  nombre: string;
  banco: string | null;
  numeroCuenta: string | null;
  cuentaId: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  sucursalId: string | null;
  sucursal: string | null;
  activa: boolean;
  /** Saldo actual según los libros (partidas contabilizadas y anuladas), con dos decimales */
  saldo: string;
}
