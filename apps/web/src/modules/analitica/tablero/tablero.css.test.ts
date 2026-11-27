import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const estilosImpresion = readFileSync(
  resolve(process.cwd(), "src/modules/analitica/tablero/tablero.css"),
  "utf8",
);

describe("estilos de impresión del tablero", () => {
  it("solo oculta el contenido cuando la pantalla del tablero está presente", () => {
    expect(estilosImpresion).toContain("body:has(.pantalla-tablero-impresion) *");
    expect(estilosImpresion).not.toMatch(/body\s*\*\s*\{/);
  });

  it("mantiene visible el tablero en impresión y no afecta otras pantallas", () => {
    const reglaOculta = estilosImpresion.match(
      /(body:has\(\.pantalla-tablero-impresion\)\s+\*)\s*\{\s*visibility:\s*hidden\s*!important;\s*\}/,
    );
    const reglaVisible = estilosImpresion.match(
      /(body:has\(\.pantalla-tablero-impresion\)\s+\.pantalla-tablero-impresion,\s*body:has\(\.pantalla-tablero-impresion\)\s+\.pantalla-tablero-impresion\s+\*)\s*\{\s*visibility:\s*visible\s*!important;\s*\}/,
    );
    expect(reglaOculta).not.toBeNull();
    expect(reglaVisible).not.toBeNull();

    const estilos = document.createElement("style");
    estilos.textContent = `${reglaOculta?.[0]} ${reglaVisible?.[0]}`;
    document.head.append(estilos);
    document.body.innerHTML = `
      <main class="pantalla-tablero-impresion">
        <p id="contenido-tablero">Ventas del mes</p>
      </main>
    `;

    expect(getComputedStyle(document.querySelector("#contenido-tablero")!).visibility).toBe("visible");

    document.body.innerHTML = `<main><p id="contenido-otra-pantalla">Otra pantalla</p></main>`;
    expect(getComputedStyle(document.querySelector("#contenido-otra-pantalla")!).visibility).not.toBe(
      "hidden",
    );
    estilos.remove();
  });
});
