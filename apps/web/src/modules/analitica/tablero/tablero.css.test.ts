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
});
