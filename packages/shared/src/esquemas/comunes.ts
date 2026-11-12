import { z } from "zod";
import { Dinero } from "../dinero/dinero";

/** Identificador UUID generado por la base de datos. */
export const idSchema = z.uuid({ error: "Identificador inválido." });

/** Fecha sin hora en formato AAAA-MM-DD, como se guarda en las columnas DATE. */
export const fechaSchema = z.iso.date({ error: "La fecha debe tener el formato AAAA-MM-DD." });

/** Texto obligatorio sin espacios sobrantes. */
export const textoSchema = (maximo: number) =>
  z
    .string()
    .trim()
    .min(1, { error: "Este campo es obligatorio." })
    .max(maximo, { error: `Máximo ${maximo} caracteres.` });

/** Texto opcional: un texto vacío se trata como ausente. */
export const textoOpcionalSchema = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, { error: `Máximo ${maximo} caracteres.` })
    .transform((v) => (v === "" ? undefined : v))
    .optional();

/**
 * Monto en dólares no negativo. Acepta texto ("1250.1") o número y lo normaliza a texto con dos
 * decimales ("1250.10") para enviarlo por la API sin perder precisión. Vacío equivale a cero.
 */
export const montoSchema = z.union([z.string(), z.number()]).transform((valor, ctx) => {
  const entrada = typeof valor === "string" && valor.trim() === "" ? "0" : valor;
  let monto: Dinero;
  try {
    monto = Dinero.de(entrada);
  } catch {
    ctx.addIssue({ code: "custom", message: "Monto inválido." });
    return z.NEVER;
  }
  if (monto.esNegativo()) {
    ctx.addIssue({ code: "custom", message: "Los montos no pueden ser negativos." });
    return z.NEVER;
  }
  return monto.aTexto();
});
