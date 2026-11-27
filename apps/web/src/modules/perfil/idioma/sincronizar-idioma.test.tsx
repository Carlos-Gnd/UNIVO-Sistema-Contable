import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { CLAVE_IDIOMA, i18n } from "@/i18n";
import { simularApi } from "@/test/api-simulada";
import { reiniciarSincronizacionIdioma, useSincronizarIdioma } from "./sincronizar-idioma";

const RUTA = "/usuarios/me/idioma";
const USUARIO = "11111111-1111-4111-8111-111111111111";

function Prueba({ usuarioId = USUARIO }: { usuarioId?: string }) {
  useSincronizarIdioma(usuarioId);
  return null;
}

beforeEach(async () => {
  reiniciarSincronizacionIdioma();
  localStorage.removeItem(CLAVE_IDIOMA);
  await i18n.changeLanguage("es");
});
afterEach(async () => {
  localStorage.removeItem(CLAVE_IDIOMA);
  await i18n.changeLanguage("es");
});

describe("sincronización del idioma con el perfil (HU-14, S4-T02)", () => {
  it("sin idioma elegido en este navegador adopta el del perfil", async () => {
    simularApi({ [`GET ${RUTA}`]: { cuerpo: { idioma: "en" } } });
    render(<Prueba />);
    await waitFor(() => expect(i18n.language).toBe("en"));
  });

  it("con un idioma elegido en este navegador, ese manda y se guarda en el perfil", async () => {
    localStorage.setItem(CLAVE_IDIOMA, "es");
    const peticiones = simularApi({
      [`GET ${RUTA}`]: { cuerpo: { idioma: "en" } },
      [`PATCH ${RUTA}`]: { cuerpo: { idioma: "es" } },
    });
    render(<Prueba />);
    await waitFor(() => expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ idioma: "es" });
    expect(i18n.language).toBe("es");
  });

  it("si ya coinciden no escribe nada, y solo consulta una vez por usuario", async () => {
    localStorage.setItem(CLAVE_IDIOMA, "es");
    const peticiones = simularApi({ [`GET ${RUTA}`]: { cuerpo: { idioma: "es" } } });
    const { rerender } = render(<Prueba />);
    await waitFor(() => expect(peticiones).toHaveLength(1));
    rerender(<Prueba />);
    rerender(<Prueba usuarioId={USUARIO} />);
    expect(peticiones.filter((p) => p.metodo === "PATCH")).toHaveLength(0);
    expect(peticiones).toHaveLength(1);
  });

  it("ignora un idioma desconocido del perfil y un fallo de la API", async () => {
    simularApi({ [`GET ${RUTA}`]: { cuerpo: { idioma: "fr" } } });
    render(<Prueba />);
    await waitFor(() => expect(i18n.language).toBe("es"));
    reiniciarSincronizacionIdioma();
    simularApi({ [`GET ${RUTA}`]: { estado: 500, cuerpo: { mensaje: "falló" } } });
    render(<Prueba />);
    await new Promise((r) => setTimeout(r, 20));
    expect(i18n.language).toBe("es");
  });
});
