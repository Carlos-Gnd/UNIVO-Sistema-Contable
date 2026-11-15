import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { CLAVE_IDIOMA, cambiarIdioma, detectarIdioma, i18n } from ".";
import { ESPACIOS, RECURSOS } from "./recursos";

/** Claves de un archivo de idioma como rutas "menu.ayuda.cerrar", para comparar español e inglés. */
function claves(objeto: object, prefijo = ""): string[] {
  return Object.entries(objeto).flatMap(([clave, valor]) =>
    typeof valor === "object" && valor !== null
      ? claves(valor, `${prefijo}${clave}.`)
      : [`${prefijo}${clave}`],
  );
}

/** Variables {{x}} que usa cada texto, para que la traducción no pierda ninguna. */
function variables(objeto: object): Record<string, string[]> {
  const resultado: Record<string, string[]> = {};
  const recorrer = (valor: unknown, ruta: string) => {
    if (typeof valor === "string")
      resultado[ruta] = [...valor.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!).sort();
    else if (typeof valor === "object" && valor !== null)
      for (const [clave, hijo] of Object.entries(valor)) recorrer(hijo, ruta ? `${ruta}.${clave}` : clave);
  };
  recorrer(objeto, "");
  return resultado;
}

afterEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("es");
});

describe("archivos de idioma", () => {
  it.each(ESPACIOS)("«%s» tiene las mismas claves en español e inglés", (espacio) => {
    expect(claves(RECURSOS.en[espacio]).sort()).toEqual(claves(RECURSOS.es[espacio]).sort());
  });

  it.each(ESPACIOS)("«%s» usa las mismas variables en español e inglés", (espacio) => {
    expect(variables(RECURSOS.en[espacio])).toEqual(variables(RECURSOS.es[espacio]));
  });

  it("ningún texto queda vacío", () => {
    const textos = (objeto: object): unknown[] =>
      Object.values(objeto).flatMap((v) => (typeof v === "object" && v !== null ? textos(v) : [v]));
    for (const idioma of Object.values(RECURSOS))
      for (const espacio of Object.values(idioma))
        for (const texto of textos(espacio)) expect(typeof texto === "string" && texto.trim()).toBeTruthy();
  });
});

describe("detectarIdioma", () => {
  it("usa el idioma que eligió el usuario", () => {
    expect(detectarIdioma("en", ["es-SV"])).toBe("en");
    expect(detectarIdioma("es", ["en-US"])).toBe("es");
  });

  it("si no eligió, usa el del navegador cuando lo soporta", () => {
    expect(detectarIdioma(null, ["en-US", "es"])).toBe("en");
    expect(detectarIdioma(null, ["es-SV"])).toBe("es");
  });

  it("por defecto, español", () => {
    expect(detectarIdioma(null, ["fr-FR"])).toBe("es");
    expect(detectarIdioma(null, [])).toBe("es");
    expect(detectarIdioma("de", [])).toBe("es");
  });
});

describe("cambiarIdioma", () => {
  function Saludo() {
    const { t } = useTranslation("layout");
    return <p>{t("menu.sinResultados", { busqueda: "iva" })}</p>;
  }

  it("traduce la interfaz, lo recuerda y actualiza el atributo lang", async () => {
    render(<Saludo />);
    expect(screen.getByText("No hay pantallas con «iva».")).toBeInTheDocument();

    await act(() => cambiarIdioma("en"));

    expect(screen.getByText("No screens match «iva».")).toBeInTheDocument();
    expect(localStorage.getItem(CLAVE_IDIOMA)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
