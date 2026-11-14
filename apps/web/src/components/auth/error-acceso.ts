/**
 * Error de inicio de sesión, recuperación o cambio de contraseña con un mensaje listo para mostrar
 * ("Correo o contraseña incorrectos."). Las pantallas de acceso muestran su mensaje en lugar del genérico.
 */
export class ErrorAcceso extends Error {
  override name = "ErrorAcceso";
}

/** Mensaje que la pantalla debe mostrar para un error: el propio si es ErrorAcceso, si no el genérico. */
export const mensajeDeAcceso = (error: unknown, generico: string): string =>
  error instanceof ErrorAcceso ? error.message : generico;
