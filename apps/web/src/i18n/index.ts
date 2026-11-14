import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ESPACIOS, IDIOMA_BASE, IDIOMAS, RECURSOS, type Idioma } from "./recursos";

export { IDIOMAS, type Idioma } from "./recursos";

/** Clave de localStorage con el idioma que eligió el usuario. */
export const CLAVE_IDIOMA = "idioma";

const esIdioma = (valor: unknown): valor is Idioma => IDIOMAS.includes(valor as Idioma);

function leerGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_IDIOMA);
  } catch {
    return null;
  }
}

/**
 * Idioma inicial: el que eligió el usuario; si no eligió, el del navegador cuando es inglés; si no, español.
 */
export function detectarIdioma(
  guardado: string | null = leerGuardado(),
  idiomasNavegador: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages,
): Idioma {
  if (esIdioma(guardado)) return guardado;
  const delNavegador = idiomasNavegador[0]?.slice(0, 2).toLowerCase();
  return esIdioma(delNavegador) ? delNavegador : IDIOMA_BASE;
}

/** Cambia el idioma de la interfaz y lo recuerda en este navegador. */
export async function cambiarIdioma(idioma: Idioma): Promise<void> {
  try {
    localStorage.setItem(CLAVE_IDIOMA, idioma);
  } catch {
    // Sin almacenamiento (modo privado): el cambio dura hasta recargar la página
  }
  await i18n.changeLanguage(idioma);
}

// El atributo lang del documento sigue al idioma: lo usan los lectores de pantalla y el corrector del navegador
i18n.on("languageChanged", (idioma) => {
  if (typeof document !== "undefined") document.documentElement.lang = idioma;
});

/**
 * react-i18next con los textos en español e inglés (S1-T30, HU-04). Los componentes no escriben textos directo:
 *
 *   const { t } = useTranslation("layout");
 *   t("menu.abrir");                                  // "Abrir menú"
 *   t("menu.sinResultados", { busqueda: "iva" });     // "No hay pantallas con «iva»."
 */
void i18n.use(initReactI18next).init({
  resources: RECURSOS,
  lng: detectarIdioma(),
  fallbackLng: IDIOMA_BASE,
  supportedLngs: IDIOMAS,
  ns: ESPACIOS,
  defaultNS: "comun",
  // React ya escapa el texto al mostrarlo
  interpolation: { escapeValue: false },
  // Los recursos van incluidos en el paquete: se inicializa al instante, sin esperar descargas
  initAsync: false,
});

export { i18n };
