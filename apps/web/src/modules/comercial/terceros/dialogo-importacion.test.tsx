import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReporteImportacionTerceros } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { DialogoImportacionTerceros } from "./dialogo-importacion";

const E = "11111111-1111-4111-8111-111111111111";
const BASE = `/empresas/${E}/terceros/importacion`;
const xlsx = (nombre = "terceros.xlsx", contenido = "contenido") =>
  new File([contenido], nombre, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const fila = (n: number, nit: string) => ({
  fila: n,
  nombre: `Tercero ${n}`,
  nit,
  nrc: null,
  actividadEconomica: null,
  clasificacion: "otro" as const,
  direccion: null,
  telefono: null,
  correo: null,
  esCliente: true,
  esProveedor: false,
  diasCredito: 0,
});

const valido: ReporteImportacionTerceros = {
  valido: true,
  filasLeidas: 2,
  errores: [],
  advertencias: [],
  filas: [fila(2, "0000-000000-011-5"), fila(3, "12345678-4")],
};
const conErrores: ReporteImportacionTerceros = {
  valido: false,
  filasLeidas: 2,
  errores: [
    { fila: 3, columna: "Tipo", mensaje: "Escribe «Cliente», «Proveedor» o «Ambos»." },
    { fila: 2, columna: "NIT", mensaje: "El NIT 1234-567890-123-0 ya existe en la empresa." },
  ],
  advertencias: [],
  filas: [],
};

const abrir = () =>
  renderizar(<DialogoImportacionTerceros empresaId={E} abierto onCerrar={() => undefined} />, {
    permisos: ["terceros.registrar"],
  });
const elegir = (f: File) =>
  fireEvent.change(screen.getByLabelText("Archivo de Excel (.xlsx)"), { target: { files: [f] } });

describe("importación de clientes y proveedores desde Excel (HU-58)", () => {
  it("rechaza lo que no es .xlsx o pasa de 5 MB sin llamar a la API", () => {
    const peticiones = simularApi({});
    abrir();
    elegir(xlsx("terceros.csv"));
    expect(screen.getByText("El archivo debe ser un libro de Excel (.xlsx).")).toBeInTheDocument();
    elegir(xlsx("grande.xlsx", "x".repeat(6 * 1024 * 1024)));
    expect(screen.getByText("El archivo pasa de 5 MB.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar archivo" })).toBeDisabled();
    expect(peticiones).toHaveLength(0);
  });

  it("muestra los errores por fila y no ofrece crear registros", async () => {
    simularApi({ [`POST ${BASE}/validar`]: { cuerpo: conErrores } });
    abrir();
    elegir(xlsx());
    fireEvent.click(screen.getByRole("button", { name: "Revisar archivo" }));
    expect(
      await screen.findByText("El archivo tiene 2 errores. No se creó ningún registro."),
    ).toBeInTheDocument();
    expect(screen.getByText("Escribe «Cliente», «Proveedor» o «Ambos».")).toBeInTheDocument();
    expect(screen.getByText("El NIT 1234-567890-123-0 ya existe en la empresa.")).toBeInTheDocument();
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
      await screen.findByText("El archivo es válido: 2 registros listos para crear."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear 2 registros" }));
    await waitFor(() => expect(peticiones.filter((p) => p.ruta.endsWith("/cargar"))).toHaveLength(1));
    const cuerpo = peticiones.find((p) => p.ruta.endsWith("/cargar"))?.cuerpo as FormData;
    expect((cuerpo.get("archivo") as File).name).toBe("terceros.xlsx");
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
