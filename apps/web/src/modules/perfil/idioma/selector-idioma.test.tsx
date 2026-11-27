import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { CLAVE_IDIOMA, i18n } from "@/i18n";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { SelectorIdioma } from "./selector-idioma";

const RUTA = "/usuarios/me/idioma";

beforeEach(async () => {
  localStorage.removeItem(CLAVE_IDIOMA);
  await i18n.changeLanguage("es");
});
afterEach(async () => {
  localStorage.removeItem(CLAVE_IDIOMA);
  await i18n.changeLanguage("es");
});

describe("selector de idioma (HU-14, S4-T02)", () => {
  it("muestra el idioma actual marcado y ofrece español e inglés", () => {
    renderizar(<SelectorIdioma />);
    expect(screen.getByRole("radiogroup", { name: "Idioma" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Español" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "English" })).not.toBeChecked();
  });

  it("cambia al instante, lo recuerda en el navegador y lo guarda en el perfil con el cuerpo exacto", async () => {
    const peticiones = simularApi({ [`PATCH ${RUTA}`]: { cuerpo: { idioma: "en" } } });
    renderizar(<SelectorIdioma />);
    fireEvent.click(screen.getByRole("radio", { name: "English" }));

    expect(await screen.findByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    expect(localStorage.getItem(CLAVE_IDIOMA)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    await waitFor(() => expect(peticiones).toHaveLength(1));
    expect(peticiones[0]).toMatchObject({ metodo: "PATCH", ruta: RUTA, cuerpo: { idioma: "en" } });
  });

  it("si el perfil no responde, el idioma elegido sigue valiendo y no se muestra ningún error", async () => {
    simularApi({
      [`PATCH ${RUTA}`]: { estado: 404, cuerpo: { mensaje: "No se encontró el perfil del usuario." } },
    });
    renderizar(<SelectorIdioma />);
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(await screen.findByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
    expect(localStorage.getItem(CLAVE_IDIOMA)).toBe("en");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("elegir el idioma que ya está activo no llama a la API", () => {
    const peticiones = simularApi({});
    renderizar(<SelectorIdioma />);
    fireEvent.click(screen.getByRole("radio", { name: "Español" }));
    expect(peticiones).toHaveLength(0);
    expect(localStorage.getItem(CLAVE_IDIOMA)).toBeNull();
  });
});
