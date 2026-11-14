import { createContext, useContext } from "react";
import type { UsuarioSesion } from "./usuario";

export type EstadoSesion = "cargando" | "activa" | "sinSesion";

export interface ValorSesion {
  estado: EstadoSesion;
  /** Usuario con sesión; null mientras carga o sin sesión */
  usuario: UsuarioSesion | null;
  iniciarSesion(correo: string, contrasena: string): Promise<void>;
  /** Cierra la sesión, vacía los datos en caché y vuelve al inicio */
  cerrarSesion(): Promise<void>;
  /** Envía el correo con el enlace para crear una contraseña nueva */
  enviarEnlaceRecuperacion(correo: string): Promise<void>;
  /** Guarda la contraseña nueva; requiere la sesión que trae el enlace del correo o la sesión iniciada */
  cambiarContrasena(contrasena: string): Promise<void>;
}

export const SesionContext = createContext<ValorSesion | null>(null);

/** Sesión del usuario. Debe usarse dentro de <SesionProvider>. */
export function useSesion(): ValorSesion {
  const valor = useContext(SesionContext);
  if (!valor) throw new Error("useSesion debe usarse dentro de <SesionProvider>.");
  return valor;
}

/** Igual que useSesion, pero devuelve null fuera de <SesionProvider> (componentes que también se prueban solos). */
export function useSesionOpcional(): ValorSesion | null {
  return useContext(SesionContext);
}
