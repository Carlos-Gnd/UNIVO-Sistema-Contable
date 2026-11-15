import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import ExcelJS from "exceljs";
import type { ReporteCatalogo, ReporteSaldosIniciales } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaImportacion } from "./pantalla-importacion";

const BASE = "/empresas/e1/importacion";
const xlsx = (nombre = "catalogo.xlsx", contenido = "contenido") =>
  new File([contenido], nombre, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const conErrores: ReporteCatalogo = {
  tipo: "catalogo",
  valido: false,
  filasLeidas: 40,
  errores: [
    {
      fila: 22,
      columna: "Código",
      mensaje: "Su cuenta padre 2103 no existe en el archivo ni en el catálogo.",
    },
    { fila: 14, columna: "Código", mensaje: "Tiene 5 dígitos; usa 1, 2, 4, 6, 8 o 10." },
    { fila: 14, columna: "Naturaleza", mensaje: "Escribe Deudora o Acreedora." },
  ],
  advertencias: [],
  filas: [],
};

const saldosValidos: ReporteSaldosIniciales = {
  tipo: "saldos-iniciales",
  valido: true,
  filasLeidas: 2,
  errores: [],
  advertencias: [
    { fila: 3, columna: "Haber", mensaje: "El saldo es contrario a la naturaleza de la cuenta." },
  ],
  filas: [
    { fila: 2, cuentaId: "c1", codigo: "110101", debe: "1000.00", haber: "0.00" },
    { fila: 3, cuentaId: "c2", codigo: "310101", debe: "0.00", haber: "1000.00" },
  ],
  resumen: { totalDebe: "1000.00", totalHaber: "1000.00", diferencia: "0.00", cuadra: true },
};

/** Descargas que hizo la pantalla: nombre y contenido de cada archivo. */
let descargas: { nombre: string; contenido: Blob }[];

beforeEach(() => {
  descargas = [];
  const blobs = new Map<string, Blob>();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL = (blob: Blob) => {
        const url = `blob:${blobs.size}`;
        blobs.set(url, blob);
        return url;
      };
      static override revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    descargas.push({ nombre: this.download, contenido: blobs.get(this.getAttribute("href") ?? "")! });
  });
});
afterEach(() => vi.unstubAllGlobals());

const mostrar = (permisos: Parameters<typeof renderizar>[1] = { permisos: ["catalogo.importar"] }) =>
  renderizar(<PantallaImportacion parametros={{ empresaId: "e1" }} />, permisos);

/** Sube el archivo y lo valida desde el paso 2. */
async function validar(usuario: ReturnType<typeof mostrar>["usuario"], archivo = xlsx()) {
  await usuario.click(screen.getByRole("button", { name: "Continuar" }));
  await usuario.upload(screen.getByLabelText(/Arrastra el archivo/), archivo);
  await usuario.click(screen.getByRole("button", { name: "Validar archivo" }));
}

describe("PantallaImportacion", () => {
  it("muestra los cuatro pasos y descarga la plantilla del tipo elegido", async () => {
    const peticiones = simularApi({
      [`GET ${BASE}/saldos-iniciales/plantilla`]: {
        archivo: new Blob(["xlsx"]),
        cabeceras: { "Content-Disposition": 'attachment; filename="plantilla_saldos_iniciales.xlsx"' },
      },
    });
    const { usuario } = mostrar();

    const pasos = screen.getByRole("list", { name: "Pasos de la importación" });
    expect(
      within(pasos)
        .getAllByRole("listitem")
        .map((p) => p.textContent),
    ).toEqual(["1Qué importar", "2Subir archivo", "3Validación", "4Listo"]);
    expect(within(pasos).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");

    await usuario.click(screen.getByRole("button", { name: /Saldos iniciales/ }));
    expect(screen.getByRole("button", { name: /Saldos iniciales/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Plantilla de saldos iniciales")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Descargar .xlsx" }));

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(descargas[0]?.nombre).toBe("plantilla_saldos_iniciales.xlsx");
    expect(peticiones[0]?.ruta).toBe(`${BASE}/saldos-iniciales/plantilla`);
  });

  it("revisa que el archivo sea un .xlsx de hasta 5 MB antes de subirlo", async () => {
    simularApi({});
    const { usuario } = mostrar();
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    const entrada = screen.getByLabelText(/Arrastra el archivo/);

    fireEvent.change(entrada, {
      target: { files: [new File(["a;b"], "catalogo.csv", { type: "text/csv" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("El archivo debe ser un Excel .xlsx.");

    fireEvent.change(entrada, { target: { files: [xlsx("grande.xlsx", "x".repeat(6 * 1024 * 1024))] } });
    expect(screen.getByRole("alert")).toHaveTextContent("El archivo pesa 6 MB; el máximo es 5 MB.");
    expect(screen.getByRole("button", { name: "Validar archivo" })).toBeDisabled();
  });

  it("acepta el archivo arrastrado y permite quitarlo", async () => {
    simularApi({});
    const { usuario } = mostrar();
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));

    fireEvent.drop(screen.getByText(/Arrastra el archivo/).closest("label")!, {
      dataTransfer: { files: [xlsx("catalogo_oriente.xlsx")] },
    });

    expect(screen.getByText("catalogo_oriente.xlsx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validar archivo" })).toBeEnabled();
    await usuario.click(screen.getByRole("button", { name: "Quitar archivo" }));
    expect(screen.queryByText("catalogo_oriente.xlsx")).not.toBeInTheDocument();
  });

  it("sube el archivo y muestra los errores por fila, que se pueden descargar", async () => {
    const peticiones = simularApi({ [`POST ${BASE}/catalogo/validar`]: { cuerpo: conErrores } });
    const { usuario } = mostrar();

    await validar(usuario);

    expect(await screen.findByText("2 filas con errores.")).toBeInTheDocument();
    const archivoEnviado = (peticiones[0]?.cuerpo as FormData).get("archivo") as File;
    expect(archivoEnviado.name).toBe("catalogo.xlsx");
    const tabla = screen.getByRole("table", { name: "Errores del archivo" });
    expect(
      within(tabla)
        .getAllByRole("row")
        .slice(1)
        .map((f) => f.textContent),
    ).toEqual([
      "14CódigoTiene 5 dígitos; usa 1, 2, 4, 6, 8 o 10.",
      "14NaturalezaEscribe Deudora o Acreedora.",
      "22CódigoSu cuenta padre 2103 no existe en el archivo ni en el catálogo.",
    ]);

    await usuario.click(screen.getByRole("button", { name: "Descargar reporte de errores" }));
    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(descargas[0]?.nombre).toBe("errores-catalogo.xlsx");
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await descargas[0]!.contenido.arrayBuffer());
    const hoja = libro.worksheets[0]!;
    expect((hoja.getRow(1).values as unknown[]).slice(1)).toEqual(["Fila", "Columna", "Qué corregir"]);
    expect((hoja.getRow(2).values as unknown[]).slice(1)).toEqual([
      14,
      "Código",
      "Tiene 5 dígitos; usa 1, 2, 4, 6, 8 o 10.",
    ]);
  });

  it("con errores permite subir el archivo corregido", async () => {
    simularApi({ [`POST ${BASE}/catalogo/validar`]: { cuerpo: conErrores } });
    const { usuario } = mostrar();
    await validar(usuario);

    await usuario.click(await screen.findByRole("button", { name: "Subir archivo corregido" }));

    expect(screen.getByText(/Arrastra el archivo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validar archivo" })).toBeDisabled();
  });

  it("con un archivo válido resume lo que se cargará y muestra los avisos", async () => {
    simularApi({ [`POST ${BASE}/saldos-iniciales/validar`]: { cuerpo: saldosValidos } });
    const { usuario } = mostrar();
    await usuario.click(screen.getByRole("button", { name: /Saldos iniciales/ }));

    await validar(usuario, xlsx("saldos.xlsx"));

    expect(await screen.findByText("Las 2 filas son válidas")).toBeInTheDocument();
    expect(screen.getByText(/Debe y haber suman US\$ 1,000\.00/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Avisos del archivo" })).toHaveTextContent(
      "3HaberEl saldo es contrario a la naturaleza de la cuenta.",
    );
    // La carga todavía no tiene API (S1-T70): el botón queda visible pero deshabilitado
    expect(screen.getByRole("button", { name: "Importar 2 filas" })).toBeDisabled();
  });

  it("avisa cuando los saldos no cuadran", async () => {
    simularApi({
      [`POST ${BASE}/saldos-iniciales/validar`]: {
        cuerpo: {
          ...saldosValidos,
          advertencias: [],
          resumen: { totalDebe: "1000.00", totalHaber: "900.00", diferencia: "100.00", cuadra: false },
        },
      },
    });
    const { usuario } = mostrar();
    await usuario.click(screen.getByRole("button", { name: /Saldos iniciales/ }));

    await validar(usuario, xlsx("saldos.xlsx"));

    expect(await screen.findByText(/hay una diferencia de US\$ 100\.00/)).toBeInTheDocument();
  });

  it("si la API rechaza el archivo, explica el motivo", async () => {
    simularApi({
      [`POST ${BASE}/catalogo/validar`]: {
        estado: 400,
        cuerpo: { message: "El archivo no tiene la hoja «Catálogo» de la plantilla." },
      },
    });
    const { usuario } = mostrar();

    await validar(usuario);

    expect(
      await screen.findByText(/No se pudo validar el archivo\. El archivo no tiene la hoja/),
    ).toBeInTheDocument();
  });

  it("sin el permiso de importar lo explica", () => {
    simularApi({});
    mostrar({ permisos: ["catalogo.ver"] });

    expect(screen.getByText("Tu rol no permite importar en esta empresa.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
  });
});
