import type { AuthError } from "@supabase/supabase-js";
import { ErrorAcceso } from "@/components/auth/error-acceso";
import { i18n } from "@/i18n";

type ClaveError =
  | "credenciales"
  | "correoSinConfirmar"
  | "demasiadosIntentos"
  | "sinConexion"
  | "enlaceVencido"
  | "mismaContrasena"
  | "contrasenaDebil"
  | "sinConfigurar";

const POR_CODIGO: Record<string, ClaveError> = {
  invalid_credentials: "credenciales",
  email_not_confirmed: "correoSinConfirmar",
  over_request_rate_limit: "demasiadosIntentos",
  over_email_send_rate_limit: "demasiadosIntentos",
  same_password: "mismaContrasena",
  weak_password: "contrasenaDebil",
  session_not_found: "enlaceVencido",
};

/** Error de acceso con el mensaje traducido al idioma actual. */
export const errorDeAcceso = (clave: ClaveError) =>
  new ErrorAcceso(i18n.t(`sesion.${clave}`, { ns: "auth" }));

/**
 * Convierte un error de Supabase Auth en un ErrorAcceso con un mensaje claro. Si el error no es conocido,
 * devuelve null y la pantalla muestra su mensaje genérico.
 */
export function traducirErrorAuth(error: AuthError): ErrorAcceso | null {
  const porCodigo = error.code ? POR_CODIGO[error.code] : undefined;
  if (porCodigo) return errorDeAcceso(porCodigo);
  // Cambiar la contraseña sin la sesión que trae el enlace del correo: el enlace venció o ya se usó
  if (error.name === "AuthSessionMissingError") return errorDeAcceso("enlaceVencido");
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return errorDeAcceso("sinConexion");
  if (error.status === 429) return errorDeAcceso("demasiadosIntentos");
  return null;
}

/** Lanza el error traducido; los desconocidos se lanzan tal cual para que la pantalla muestre el genérico. */
export function lanzarSiHayError(error: AuthError | null): void {
  if (error) throw traducirErrorAuth(error) ?? error;
}
