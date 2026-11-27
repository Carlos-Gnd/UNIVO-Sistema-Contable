import { describe, expect, it } from "vitest";
import { firmarEstadoSchema } from "@contable/shared";
import type { DocumentoEstado } from "../exportacion/documento-estado";
import { documentoAFirma } from "./documento-a-firma";

const documento: DocumentoEstado = {
  titulo: "Estado de resultados",
  periodo: "Del 01/11/2026 al 30/11/2026",
  columnas: [{ titulo: "US$", tipo: "dinero" }],
  filas: [
    { id: "v", texto: "Ventas", tipo: "seccion" },
    { id: "v1", texto: "5101 · Ventas netas", valores: ["46051.20"], tipo: "renglon" },
    { id: "n", texto: "Utilidad neta", valores: ["-7594.99"], tipo: "resultado" },
  ],
  nombreHoja: "Estado de resultados",
  nombreArchivo: "estado-resultados",
};

describe("documentoAFirma (HU-87, S4-T32)", () => {
  it("envía título, período, alcance, columnas y filas tal como se exportan, sin ids ni nombres de archivo", () => {
    const cuerpo = documentoAFirma(documento, "Consolidado");
    expect(cuerpo).toEqual({
      titulo: "Estado de resultados",
      periodo: "Del 01/11/2026 al 30/11/2026",
      alcance: "Consolidado",
      columnas: [{ titulo: "US$", tipo: "dinero" }],
      filas: [
        { texto: "Ventas", tipo: "seccion" },
        { texto: "5101 · Ventas netas", tipo: "renglon", valores: ["46051.20"] },
        { texto: "Utilidad neta", tipo: "resultado", valores: ["-7594.99"] },
      ],
    });
  });

  it("cumple el contrato de la API y omite el cargo vacío", () => {
    const cuerpo = documentoAFirma(documento, "Consolidado", "   ");
    expect(cuerpo).not.toHaveProperty("cargo");
    expect(firmarEstadoSchema.safeParse(cuerpo).success).toBe(true);
    expect(documentoAFirma(documento, "Consolidado", " Contador general ").cargo).toBe("Contador general");
  });
});
