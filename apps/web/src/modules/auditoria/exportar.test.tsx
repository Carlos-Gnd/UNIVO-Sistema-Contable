import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import type { EntradaBitacora, PaginaBitacora } from "@contable/shared";
import { i18n } from "@/i18n";
import { simularApi, type PeticionSimulada } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import {
  DemasiadosRegistrosError,
  crearLibroBitacora,
  describirFiltros,
  nombreArchivo,
  todosLosRegistros,
} from "./exportar";
import { PantallaBitacora } from "./pantalla-bitacora";

vi.mock("sonner", async (original) => ({
  ...(await original<typeof import("sonner")>()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const t = i18n.getFixedT("es", "bitacora");

const entrada = (id: number): EntradaBitacora => ({
  id: String(id),
  fecha: "2026-11-10T22:42:00.000Z",
  usuario: { id: "u-carlos", nombre: "Carlos Guandique", correo: "carlos@gmail.com" },
  modulo: "contabilidad",
  tabla: "partidas",
  accion: "UPDATE",
  registroId: `p${id}`,
  datosAnteriores: { id: `p${id}`, estado: "borrador", numero: null },
  datosNuevos: { id: `p${id}`, estado: "contabilizada", numero: id },
});

/** API con `total` cambios repartidos en páginas del tamaño que pida la consulta. */
function simularPaginas(total: number) {
  const peticiones = simularApi({
    "GET /empresas/e1/bitacora": ({ consulta }: PeticionSimulada): { cuerpo: PaginaBitacora } => {
      const pagina = Number(consulta.get("pagina") ?? 1);
      const porPagina = Number(consulta.get("porPagina") ?? 25);
      const desde = (pagina - 1) * porPagina;
      const cantidad = Math.max(0, Math.min(porPagina, total - desde));
      return {
        cuerpo: {
          registros: Array.from({ length: cantidad }, (_, i) => entrada(desde + i + 1)),
          total,
          pagina,
          porPagina,
          paginas: Math.max(1, Math.ceil(total / porPagina)),
        },
      };
    },
  });
  return () => peticiones.map((p) => Object.fromEntries(p.consulta));
}

async function leerLibro(contenido: Blob) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await contenido.arrayBuffer());
  return libro.worksheets[0]!;
}

afterEach(() => vi.unstubAllGlobals());

describe("todosLosRegistros", () => {
  it("recorre todas las páginas de 100 en 100 con los mismos filtros", async () => {
    const consultas = simularPaginas(250);

    const registros = await todosLosRegistros("e1", { modulo: "contabilidad", pagina: 3, porPagina: 25 });

    expect(registros).toHaveLength(250);
    expect(registros.at(-1)?.id).toBe("250");
    expect(consultas()).toEqual([
      { modulo: "contabilidad", pagina: "1", porPagina: "100" },
      { modulo: "contabilidad", pagina: "2", porPagina: "100" },
      { modulo: "contabilidad", pagina: "3", porPagina: "100" },
    ]);
  });

  it("no descarga más de 10 000 cambios", async () => {
    const consultas = simularPaginas(10_001);
    await expect(todosLosRegistros("e1", {})).rejects.toBeInstanceOf(DemasiadosRegistrosError);
    expect(consultas()).toHaveLength(1);
  });
});

describe("crearLibroBitacora", () => {
  it("genera la hoja con título, filtros, encabezado y una fila por cambio", async () => {
    const filtros = {
      rango: "personalizado" as const,
      modulo: "contabilidad" as const,
      desde: "2026-11-01",
      hasta: "2026-11-14",
    };
    const hoja = await leerLibro(
      await crearLibroBitacora([entrada(7)], filtros, t, new Date("2026-11-14T16:00:00Z")),
    );

    expect(hoja.name).toBe("Bitácora");
    expect(hoja.getCell("A1").value).toBe("Bitácora de auditoría");
    expect(hoja.getCell("A2").value).toBe("Generado el 14/11/2026 10:00");
    expect(hoja.getCell("A3").value).toBe("Filtros: Partidas y períodos · 01/11/2026 – 14/11/2026");
    expect((hoja.getRow(5).values as unknown[]).slice(1)).toEqual([
      "Fecha y hora",
      "Usuario",
      "Correo",
      "Acción",
      "Módulo",
      "Registro",
      "Cambios",
    ]);
    expect((hoja.getRow(6).values as unknown[]).slice(1)).toEqual([
      "10/11/2026 16:42",
      "Carlos Guandique",
      "carlos@gmail.com",
      "Modificación",
      "Partidas y períodos",
      "Partida n.º 7",
      "Estado: borrador → contabilizada\nNúmero: — → 7",
    ]);
  });

  it("describe los filtros y nombra el archivo con la fecha", () => {
    expect(describirFiltros({ rango: "todas" }, t)).toBe("Sin filtros");
    expect(
      describirFiltros({ rango: "todas", accion: "DELETE", usuario: { id: "u", nombre: "María Rivas" } }, t),
    ).toBe("Eliminación · María Rivas");
    expect(nombreArchivo(t, new Date(2026, 10, 14))).toBe("bitacora-2026-11-14.xlsx");
  });
});

describe("botón Exportar a Excel", () => {
  it("solo aparece con el permiso de exportar", async () => {
    simularPaginas(3);
    renderizar(<PantallaBitacora parametros={{ empresaId: "e1" }} />, { permisos: ["bitacora.ver"] });

    await screen.findAllByRole("row");
    expect(screen.queryByRole("button", { name: "Exportar a Excel" })).not.toBeInTheDocument();
  });

  it("exporta todos los cambios filtrados y descarga el archivo", async () => {
    const consultas = simularPaginas(3);
    const crearUrl = vi.fn(() => "blob:bitacora");
    // URL simulada solo para esta prueba: jsdom no implementa createObjectURL
    vi.stubGlobal(
      "URL",
      class extends URL {
        static override createObjectURL = crearUrl;
        static override revokeObjectURL = vi.fn();
      },
    );
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { usuario } = renderizar(<PantallaBitacora parametros={{ empresaId: "e1" }} />, {
      permisos: ["bitacora.ver", "bitacora.exportar"],
    });

    await usuario.click(await screen.findByRole("button", { name: "Exportar a Excel" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Bitácora exportada: 3 cambios."));
    expect(consultas().at(-1)).toEqual({ pagina: "1", porPagina: "100" });
    expect(crearUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(clic).toHaveBeenCalledOnce();
    expect((clic.mock.contexts[0] as HTMLAnchorElement).download).toMatch(
      /^bitacora-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });

  it("avisa si hay demasiados cambios para exportar", async () => {
    simularPaginas(12_000);
    const { usuario } = renderizar(<PantallaBitacora parametros={{ empresaId: "e1" }} />, {
      permisos: ["bitacora.ver", "bitacora.exportar"],
    });

    await usuario.click(await screen.findByRole("button", { name: "Exportar a Excel" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Hay 12000 cambios con esos filtros y el máximo para exportar es 10000. Acota las fechas o el módulo.",
      ),
    );
  });

  it("está deshabilitado si no hay cambios que exportar", async () => {
    simularPaginas(0);
    renderizar(<PantallaBitacora parametros={{ empresaId: "e1" }} />, {
      permisos: ["bitacora.ver", "bitacora.exportar"],
    });

    await screen.findByText("Todavía no hay cambios registrados en esta empresa.");
    expect(screen.getByRole("button", { name: "Exportar a Excel" })).toBeDisabled();
  });
});
