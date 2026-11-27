import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";
import { cambiarIdioma, IDIOMAS, type Idioma } from "@/i18n";
import { guardarIdioma } from "./idioma-api";

/**
 * Selector de idioma de la interfaz (HU-14, S4-T02): español o inglés. Cambia al instante, lo recuerda en este
 * navegador y lo guarda en el perfil; si el perfil no responde, el idioma local sigue valiendo.
 */
export function SelectorIdioma() {
  const { t, i18n } = useTranslation("layout");

  async function elegir(idioma: Idioma) {
    if (i18n.language === idioma) return;
    await cambiarIdioma(idioma);
    try {
      await guardarIdioma(idioma);
    } catch {
      // Sin perfil o sin conexión: queda guardado solo en este navegador
    }
  }

  return (
    <div className="grid gap-2 px-4 pb-3">
      <span
        id="selector-idioma"
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
      >
        <Languages className="size-3.5" aria-hidden />
        {t("cuenta.idioma")}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="selector-idioma"
        className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1"
      >
        {IDIOMAS.map((idioma) => (
          <button
            key={idioma}
            type="button"
            role="radio"
            aria-checked={i18n.language === idioma}
            lang={idioma}
            onClick={() => void elegir(idioma)}
            className={cn(
              "h-8 rounded-md text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              i18n.language === idioma
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`cuenta.idiomas.${idioma}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
