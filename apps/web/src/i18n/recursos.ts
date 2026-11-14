import authEn from "./locales/en/auth.json";
import comunEn from "./locales/en/comun.json";
import layoutEn from "./locales/en/layout.json";
import authEs from "./locales/es/auth.json";
import comunEs from "./locales/es/comun.json";
import layoutEs from "./locales/es/layout.json";

/**
 * Textos de la interfaz por idioma y espacio de nombres (S1-T30). El español es el idioma base: sus archivos
 * definen las claves válidas y el inglés debe tener exactamente las mismas (lo verifica i18n.test.ts).
 *
 * Para agregar los textos de un módulo: crear locales/es/<modulo>.json y locales/en/<modulo>.json, registrarlos
 * aquí y usarlos con useTranslation("<modulo>").
 */
export const RECURSOS = {
  es: { comun: comunEs, auth: authEs, layout: layoutEs },
  en: { comun: comunEn, auth: authEn, layout: layoutEn },
} as const;

export const IDIOMAS = ["es", "en"] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_BASE: Idioma = "es";

export const ESPACIOS = Object.keys(RECURSOS[IDIOMA_BASE]) as (keyof (typeof RECURSOS)["es"])[];
