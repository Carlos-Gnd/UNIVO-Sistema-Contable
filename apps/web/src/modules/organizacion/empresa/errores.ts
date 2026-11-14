import { ErrorApi, type ErroresPorCampo } from "@/lib/api";

/**
 * Errores de la API ubicados en su campo: los 400 ya vienen por campo y el 409 de la API de empresas
 * solo ocurre por un NIT ya registrado (NitDuplicadoError).
 */
export function erroresDeRegistro(error: unknown): ErroresPorCampo {
  if (!(error instanceof ErrorApi)) return {};
  if (error.estado === 409) return { nit: [error.message] };
  return error.errores;
}
