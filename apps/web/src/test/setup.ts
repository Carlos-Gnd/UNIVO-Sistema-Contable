import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { i18n } from "@/i18n";

// Las pruebas buscan los textos en español, sin importar el idioma del sistema donde corren
await i18n.changeLanguage("es");

afterEach(() => {
  cleanup();
});

// jsdom no implementa estas APIs del navegador que usan los componentes de Radix
class ResizeObserverSimulado {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverSimulado as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
