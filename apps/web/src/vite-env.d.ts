/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** URL pública de la API (Render). En desarrollo, http://localhost:3000 */
  readonly VITE_API_URL?: string;
  /** URL del proyecto de Supabase, para Supabase Auth */
  readonly VITE_SUPABASE_URL?: string;
  /** Clave publishable de Supabase (pública por diseño; la secret solo va en la API) */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
