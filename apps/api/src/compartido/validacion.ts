import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

/** Valida la entrada con un esquema de @contable/shared; si no cumple responde 400 con los errores por campo. */
export function validar<S extends z.ZodType>(esquema: S, datos: unknown): z.infer<S> {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    throw new BadRequestException({
      mensaje: "Los datos enviados no son válidos.",
      errores: z.flattenError(r.error).fieldErrors,
    });
  }
  return r.data;
}
