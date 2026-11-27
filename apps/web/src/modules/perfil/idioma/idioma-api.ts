import { api } from "@/lib/api";
import type { Idioma } from "@/i18n";

/** Idioma guardado en el perfil del usuario (HU-14, S4-T01). Sin perfil todavía, la API responde «es». */
export const consultarIdioma = (senal?: AbortSignal) =>
  api<{ idioma: string }>("/usuarios/me/idioma", { senal });

export const guardarIdioma = (idioma: Idioma) =>
  api<{ idioma: string }>("/usuarios/me/idioma", { metodo: "PATCH", cuerpo: { idioma } });
