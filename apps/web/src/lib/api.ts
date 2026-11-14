/**
 * Cliente HTTP de la API (NestJS en Render). Envía el JWT de Supabase como Bearer y convierte las
 * respuestas de error en ErrorApi con el mensaje y los errores por campo que devuelve la API.
 */

export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Errores por campo, como los devuelve validar() en la API: { campo: ["mensaje", …] }. */
export type ErroresPorCampo = Record<string, string[] | undefined>;

export const MENSAJE_SIN_CONEXION =
  "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";

const MENSAJES_POR_ESTADO: Record<number, string> = {
  400: "Los datos enviados no son válidos.",
  401: "Tu sesión terminó. Vuelve a iniciar sesión.",
  403: "No tienes permiso para realizar esta acción.",
  404: "No se encontró lo que buscas.",
  409: "La operación entra en conflicto con datos existentes.",
  422: "La operación no cumple las reglas contables.",
};
const MENSAJE_GENERICO = "Ocurrió un error inesperado. Inténtalo de nuevo.";

export class ErrorApi extends Error {
  constructor(
    /** Código HTTP; 0 cuando no hubo respuesta (sin conexión) */
    readonly estado: number,
    mensaje: string,
    readonly errores: ErroresPorCampo = {},
    /** Cuerpo completo de la respuesta, para errores con datos adicionales (por ejemplo, líneas de una partida) */
    readonly cuerpo?: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }

  /** Primer mensaje de error de un campo, para mostrarlo debajo de su control. */
  errorDe(campo: string): string | undefined {
    return this.errores[campo]?.[0];
  }
}

type ObtenerToken = () => string | null | undefined | Promise<string | null | undefined>;

let obtenerToken: ObtenerToken = () => null;

/**
 * Registra la función que entrega el token de acceso vigente. La llama el módulo de sesión (Supabase
 * Auth) al iniciar; así este cliente no depende de cómo se guarda la sesión.
 */
export function configurarToken(fn: ObtenerToken): void {
  obtenerToken = fn;
}

export function urlBaseApi(): string {
  return (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Extrae el mensaje de los dos formatos de error de NestJS: { mensaje } propio o { message } por defecto. */
function mensajeDe(cuerpo: unknown, estado: number): string {
  if (esObjeto(cuerpo)) {
    if (typeof cuerpo.mensaje === "string" && cuerpo.mensaje) return cuerpo.mensaje;
    if (typeof cuerpo.message === "string" && cuerpo.message) return cuerpo.message;
    if (Array.isArray(cuerpo.message) && typeof cuerpo.message[0] === "string") return cuerpo.message[0];
  }
  return MENSAJES_POR_ESTADO[estado] ?? MENSAJE_GENERICO;
}

function erroresDe(cuerpo: unknown): ErroresPorCampo {
  if (!esObjeto(cuerpo) || !esObjeto(cuerpo.errores)) return {};
  const errores: ErroresPorCampo = {};
  for (const [campo, mensajes] of Object.entries(cuerpo.errores)) {
    if (Array.isArray(mensajes)) errores[campo] = mensajes.filter((m): m is string => typeof m === "string");
  }
  return errores;
}

async function leerCuerpo(respuesta: Response): Promise<unknown> {
  const texto = await respuesta.text();
  if (!texto) return undefined;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto;
  }
}

export interface OpcionesPeticion {
  metodo?: MetodoHttp;
  cuerpo?: unknown;
  senal?: AbortSignal;
}

/** Hace una petición a la API y devuelve el JSON de la respuesta, o lanza ErrorApi. */
export async function api<T>(
  ruta: string,
  { metodo = "GET", cuerpo, senal }: OpcionesPeticion = {},
): Promise<T> {
  const token = await obtenerToken();
  const cabeceras: Record<string, string> = { Accept: "application/json" };
  if (cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let respuesta: Response;
  try {
    respuesta = await fetch(`${urlBaseApi()}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: senal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ErrorApi(0, MENSAJE_SIN_CONEXION);
  }

  const datos = await leerCuerpo(respuesta);
  if (!respuesta.ok) {
    throw new ErrorApi(respuesta.status, mensajeDe(datos, respuesta.status), erroresDe(datos), datos);
  }
  return datos as T;
}

/** Mensaje legible de cualquier error, para avisos (toast) y alertas. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.message;
  return MENSAJE_GENERICO;
}
