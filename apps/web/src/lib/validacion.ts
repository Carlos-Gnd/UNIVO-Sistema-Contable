import { z } from "zod";
import type { ErroresPorCampo } from "@/lib/api";

export type ResultadoFormulario<T> = { ok: true; datos: T } | { ok: false; errores: ErroresPorCampo };

/**
 * Valida un formulario con el mismo esquema Zod de @contable/shared que usa la API, y devuelve los
 * errores con la misma forma que la respuesta 400 de la API para mostrarlos igual.
 */
export function validarFormulario<S extends z.ZodType>(
  esquema: S,
  datos: unknown,
): ResultadoFormulario<z.infer<S>> {
  const r = esquema.safeParse(datos);
  if (r.success) return { ok: true, datos: r.data };
  const { fieldErrors, formErrors } = z.flattenError(r.error);
  const errores: ErroresPorCampo = { ...(fieldErrors as ErroresPorCampo) };
  if (formErrors.length) errores._formulario = formErrors;
  return { ok: false, errores };
}
