import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReporteImportacionProductos } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { DialogoImportacionProductos } from "./dialogo-importacion";

const E = "11111111-1111-4111-8111-111111111111";
const BASE = `/empresas/${E}/productos/importacion`;
const xlsx = (nombre = "productos.xlsx", contenido = "contenido") =>
  new File([contenido], nombre, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const fila = (n: number, codigo: string) => ({
  fila: n,
  codigo,
  nombre: `Producto ${codigo}`,
  categoriaId: null,
  unidadMedida: null,
  precioVenta: "0.00",
  existenciaMinima: "0.0000",
  controlaSeries: false,
  metodoValuacion: null,
});

const valido: ReporteImportacionProductos = {
  valido: true,
  filasLeidas: 2,
  errores: [],
  advertencias: [],
  filas: [fila(2, "A-1"), fila(3, "A-2")],
};
const conErrores: ReporteImportacionProductos = {
  valido: false,
  filasLeidas: 2,
  errores: [
    { fila: 3, columna: "Categoría", mensaje: "La categoría «X» no existe o está inactiva." },
    { fila: 2, columna: "Código", mensaje: "Ya existe un producto con este código." },
  ],
  advertencias: [],
  filas: [],
};

const abrir = () =>
  renderizar(<DialogoImportacionProductos empresaId={E} abierto onCerrar={() => undefined} />, {
    permisos: ["inventario.registrar"],
  });
const elegir = (f: File) =>
  fireEvent.change(screen.getByLabelText("Archivo de Excel (.xlsx)"), { target: { files: [f] } });

describe("importación de productos desde Excel (HU-64)", () => {
  it("rechaza lo que no es .xlsx o pasa de 5 MB sin llamar a la API", () => {
    const peticiones = simularApi({});
    abrir();
    elegir(xlsx("productos.csv"));
    expect(screen.getByText("El archivo debe ser un libro de Excel (.xlsx).")).toBeInTheDocument();
    elegir(xlsx("grande.xlsx", "x".repeat(6 * 1024 * 1024)));
    expect(screen.getByText("El archivo pasa de 5 MB.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar archivo" })).toBeDisabled();
    expect(peticiones).toHaveLength(0);
  });

  it("muestra los errores por fila y no ofrece crear productos", async () => {
    simularApi({ [`POST ${BASE}/validar`]: { cuerpo: conErrores } });
    abrir();
    elegir(xlsx());
    fireEvent.click(screen.getByRole("button", { name: "Revisar archivo" }));
    expect(
      await screen.findByText("El archivo tiene 2 errores. No se creó ningún producto."),
    ).toBeInTheDocument();
    expect(screen.getByText("La categoría «X» no existe o está inactiva.")).toBeInTheDocument();
    expect(screen.getByText("Ya existe un producto con este código.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Crear \d/ })).not.toBeInTheDocument();
  });

  it("con un archivo válido ofrece crear y envía el archivo a la carga", async () => {
    const peticiones = simularApi({
      [`POST ${BASE}/validar`]: { cuerpo: valido },
      [`POST ${BASE}/cargar`]: { cuerpo: { reporte: valido, creados: 2 } },
    });
    abrir();
    elegir(xlsx());
    fireEvent.click(screen.getByRole("button", { name: "Revisar archivo" }));
    expect(
      await screen.findByText("El archivo es válido: 2 productos listos para crear."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear 2 productos" }));
    await waitFor(() => expect(peticiones.filter((p) => p.ruta.endsWith("/cargar"))).toHaveLength(1));
    const cuerpo = peticiones.find((p) => p.ruta.endsWith("/cargar"))?.cuerpo as FormData;
    expect((cuerpo.get("archivo") as File).name).toBe("productos.xlsx");
  });

  it("muestra el rechazo de la API", async () => {
    simularApi({
      [`POST ${BASE}/validar`]: {
        estado: 400,
        cuerpo: { mensaje: "El archivo no es un libro de Excel (.xlsx) válido." },
      },
    });
    abrir();
    elegir(xlsx());
    fireEvent.click(screen.getByRole("button", { name: "Revisar archivo" }));
    expect(await screen.findByText(/no es un libro de Excel/)).toBeInTheDocument();
  });
});
