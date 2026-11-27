import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const estilosImpresion = readFileSync(
  resolve(process.cwd(), "src/modules/analitica/razones/razones.css"),
  "utf8",
);

describe("estilos de impresión de razones financieras", () => {
  it("mantiene visible la pantalla al imprimir y no oculta otras pantallas", () => {
    const reglaOculta = estilosImpresion.match(
      /(body:has\(\.pantalla-razones\)\s+\*)\s*\{\s*visibility:\s*hidden\s*!important;\s*\}/,
    );
    const reglaVisible = estilosImpresion.match(
      /(body:has\(\.pantalla-razones\)\s+\.pantalla-razones,\s*body:has\(\.pantalla-razones\)\s+\.pantalla-razones\s+\*)\s*\{\s*visibility:\s*visible\s*!important;\s*\}/,
    );
    expect(reglaOculta).not.toBeNull();
    expect(reglaVisible).not.toBeNull();

    const estilos = document.createElement("style");
    estilos.textContent = `${reglaOculta?.[0]} ${reglaVisible?.[0]}`;
    document.head.append(estilos);
    document.body.innerHTML = `
      <main class="pantalla-razones">
        <p id="contenido-razones">Liquidez corriente</p>
      </main>
    `;

    expect(getComputedStyle(document.querySelector("#contenido-razones")!).visibility).toBe("visible");

    document.body.innerHTML = `<main><p id="contenido-otra-pantalla">Otra pantalla</p></main>`;
    expect(getComputedStyle(document.querySelector("#contenido-otra-pantalla")!).visibility).not.toBe(
      "hidden",
    );
    estilos.remove();
  });
});
