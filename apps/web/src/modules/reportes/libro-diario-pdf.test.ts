import { describe, expect, it } from "vitest";
import type { LibroDiario } from "@contable/shared";
import { crearDocumentoLibroDiario } from "./libro-diario-pdf";

const libro: LibroDiario = {
  desde: "2026-01-01",
  hasta: "2026-01-31",
  sucursalId: "sucursal-1",
  tipo: null,
  renglonesPorPagina: 40,
  partidas: 1,
  cuadra: true,
  totales: { debe: "100.00", haber: "100.00" },
  paginas: [
    {
      folio: 8,
      vienen: { debe: "25.00", haber: "25.00" },
      pasan: { debe: "125.00", haber: "125.00" },
      renglones: [
        {
          tipo: "partida",
          partidaId: "partida-1",
          fecha: "2026-01-05",
          codigo: "001-0001",
          descripcion: "Apertura",
          parcial: null,
          debe: null,
          haber: null,
        },
        {
          tipo: "cuenta",
          partidaId: "partida-1",
          fecha: null,
          codigo: "1101",
          descripcion: "Efectivo y equivalentes",
          parcial: null,
          debe: "100.00",
          haber: null,
        },
        {
          tipo: "concepto",
          partidaId: "partida-1",
          fecha: null,
          codigo: null,
          descripcion: "V/ Aporte de capital <inicial>",
          parcial: null,
          debe: null,
          haber: null,
        },
      ],
    },
  ],
};

describe("crearDocumentoLibroDiario", () => {
  it("incluye los folios, columnas y totales Vienen y Pasan", () => {
    const documento = crearDocumentoLibroDiario(libro, {
      empresa: "CheroPhonex",
      nit: "0614-010101-101-1",
      sucursal: "Casa matriz",
    });

    expect(documento).toContain("Folio 8");
    expect(documento).not.toContain("Folio 8 de 1");
    expect(documento).toContain('<th class="fecha">Fecha</th>');
    expect(documento).toContain('<th class="partida">Partida</th>');
    expect(documento).toContain('<th class="monto">Parcial</th>');
    expect(documento).toContain('<th class="monto">Debe</th>');
    expect(documento).toContain('<th class="monto">Haber</th>');
    expect(documento).toContain("Vienen");
    expect(documento).toContain("Pasan");
    expect(documento).toContain("05/01/2026");
    expect(documento).toContain("body { background: #fff; color: #111; }");
    expect(documento).not.toMatch(/height:\s*277mm|overflow:\s*hidden/);
    expect(documento).toContain("break-inside: auto");
    expect(documento).toContain("@page { size: A4 portrait");
  });

  it.each([40, 100])("conserva los %i renglones y la fila Pasan", (cantidad) => {
    const renglones = Array.from({ length: cantidad }, (_, indice) => ({
      tipo: "cuenta" as const,
      partidaId: "partida-1",
      fecha: null,
      codigo: String(1100 + indice),
      descripcion: `Movimiento ${indice + 1}`,
      parcial: null,
      debe: "1.00",
      haber: null,
    }));
    const documento = crearDocumentoLibroDiario(
      {
        ...libro,
        renglonesPorPagina: cantidad,
        paginas: [{ ...libro.paginas[0]!, renglones }],
      },
      { empresa: "CheroPhonex" },
    );

    for (let indice = 1; indice <= cantidad; indice++) {
      expect(documento).toContain(`Movimiento ${indice}`);
    }
    expect(documento).toContain("Pasan");
  });

  it("escapa contenido del reporte antes de insertarlo en el HTML", () => {
    const documento = crearDocumentoLibroDiario(libro, { empresa: "Empresa <demo>" });

    expect(documento).toContain("Empresa &lt;demo&gt;");
    expect(documento).toContain("Aporte de capital &lt;inicial&gt;");
    expect(documento).not.toContain("Aporte de capital <inicial>");
  });
});
