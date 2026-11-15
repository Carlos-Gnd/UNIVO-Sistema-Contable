import { createClient, type AuthChangeEvent, type AuthError, type Session } from "@supabase/supabase-js";

/**
 * Parte de Supabase Auth que usa la web. Con esta interfaz el proveedor de sesión no depende del cliente real y
 * las pruebas pueden pasarle uno simulado.
 */
export interface AuthCliente {
  getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  onAuthStateChange(alCambiar: (evento: AuthChangeEvent, sesion: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithPassword(credenciales: { email: string; password: string }): Promise<{ error: AuthError | null }>;
  signOut(): Promise<{ error: AuthError | null }>;
  resetPasswordForEmail(
    correo: string,
    opciones?: { redirectTo?: string },
  ): Promise<{ error: AuthError | null }>;
  updateUser(atributos: { password: string }): Promise<{ error: AuthError | null }>;
}

let auth: AuthCliente | null | undefined;

/**
 * Cliente de Supabase Auth de la web (S1-T34), o null si faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY.
 * Guarda la sesión en localStorage, renueva el token antes de que venza y lee la sesión que traen los enlaces
 * de invitación y de recuperación de contraseña.
 */
export function authSupabase(): AuthCliente | null {
  if (auth !== undefined) return auth;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  auth =
    url && clave
      ? createClient(url, clave, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        }).auth
      : null;
  return auth;
}
