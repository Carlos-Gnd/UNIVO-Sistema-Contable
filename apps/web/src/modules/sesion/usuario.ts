import type { Session } from "@supabase/supabase-js";

/** Usuario con sesión iniciada, con lo que muestra la interfaz (menú y encabezado). */
export interface UsuarioSesion {
  id: string;
  correo: string;
  nombre: string;
  /** Una o dos letras para el avatar, como "MR" */
  iniciales: string;
}

const textoDe = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

/** Iniciales de un nombre: primera letra de las dos primeras palabras, o las dos primeras letras si es una. */
export function iniciales(nombre: string): string {
  const palabras = nombre.split(/[\s._-]+/).filter(Boolean);
  const letras =
    palabras.length >= 2 ? `${palabras[0]![0]}${palabras[1]![0]}` : (palabras[0]?.slice(0, 2) ?? "?");
  return letras.toUpperCase();
}

/**
 * Datos del usuario a partir de la sesión de Supabase. El nombre sale de los metadatos (nombre o full_name);
 * si no hay, de la parte del correo antes de la @.
 */
export function usuarioDeSesion(sesion: Session): UsuarioSesion {
  const { user } = sesion;
  const correo = user.email ?? "";
  const metadatos: Record<string, unknown> = user.user_metadata ?? {};
  const nombre = textoDe(metadatos.nombre) || textoDe(metadatos.full_name) || correo.split("@")[0] || correo;
  return { id: user.id, correo, nombre, iniciales: iniciales(nombre) };
}
