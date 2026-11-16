import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { EntradaBitacora, PaginaBitacora } from "@contable/shared";
import { i18n } from "@/i18n";
import { hoyIso } from "@/lib/formato";
import { simularApi, type PeticionSimulada } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaBitacora } from "./pantalla-bitacora";
import {
  cambiosDe,
  describirRegistro,
  fechasDeRango,
  formatearFechaHora,
  formatearValor,
} from "./presentacion";

const t = i18n.getFixedT("es", "bitacora");

const CARLOS = { id: "u-carlos", nombre: "Carlos Guandique", correo: "carlos@gmail.com" };
const MARIA = { id: "u-maria", nombre: "María Rivas", correo: "maria@gmail.com" };

const contabilizada: EntradaBitacora = {
  id: "3",
  fecha: "2026-11-10T22:42:00.000Z",
  usuario: CARLOS,
  modulo: "contabilidad",
  tabla: "partidas",
  accion: "UPDATE",
  registroId: "p1",
  datosAnteriores: {
    id: "p1",
    empresa_id: "e1",
    estado: "borrador",
    numero: null,
    concepto: "Pago de energía",
  },
  datosNuevos: {
    id: "p1",
    empresa_id: "e1",
    estado: "contabilizada",
    numero: 7,
    concepto: "Pago de energía",
  },
};
const cuentaNueva: EntradaBitacora = {
  id: "2",
  fecha: "2026-11-09T23:31:00.000Z",
  usuario: MARIA,
  modulo: "catalogo",
  tabla: "cuentas",
  accion: "INSERT",
  registroId: "c1",
  datosAnteriores: null,
  datosNuevos: { id: "c1", codigo: "1101", nombre: "Caja general", activa: true },
};
const migracion: EntradaBitacora = {
  id: "1",
  fecha: "2026-11-08T15:00:00.000Z",
  usuario: null,
  modulo: "organizacion",
  tabla: "empresas",
  accion: "UPDATE",
  registroId: "e1",
  datosAnteriores: { id: "e1", nombre: "Comercial Oriente", telefono: "2661-4400" },
  datosNuevos: { id: "e1", nombre: "Comercial Oriente", telefono: "2661-4410" },
};

const pagina = (registros: EntradaBitacora[], extra: Partial<PaginaBitacora> = {}): PaginaBitacora => ({
  registros,
  total: registros.length,
  pagina: 1,
  porPagina: 25,
  paginas: 1,
  ...extra,
});

/** Simula la API de bitácora y devuelve las consultas recibidas como objetos. */
function simularBitacora(
  responder: (consulta: URLSearchParams) => PaginaBitacora = () =>
    pagina([contabilizada, cuentaNueva, migracion]),
) {
  const peticiones = simularApi({
    "GET /empresas/e1/bitacora": (p: PeticionSimulada) => ({ cuerpo: responder(p.consulta) }),
  });
  return () =>
    peticiones.filter((p) => p.ruta === "/empresas/e1/bitacora").map((p) => Object.fromEntries(p.consulta));
}

const mostrar = () =>
  renderizar(<PantallaBitacora parametros={{ empresaId: "e1" }} />, { permisos: ["bitacora.ver"] });

afterEach(() => vi.unstubAllGlobals());

describe("PantallaBitacora", () => {
  it("lista los cambios con fecha en hora de El Salvador, usuario, acción, módulo y registro", async () => {
    const consultas = simularBitacora();
    mostrar();

    const filas = await screen.findAllByRole("row");
    expect(filas).toHaveLength(4);
    expect(filas[1]).toHaveTextContent(
      "10/11/2026 16:42Carlos GuandiqueModificaciónPartidas y períodosPartida n.º 7",
    );
    expect(filas[2]).toHaveTextContent("María RivasCreaciónCatálogo de cuentas1101 Caja general");
    expect(filas[3]).toHaveTextContent("SistemaModificaciónEmpresas y sucursalesComercial Oriente");
    expect(consultas()[0]).toEqual({ pagina: "1", porPagina: "25" });
  });

  it("filtra por módulo y acción, y vuelve a la primera página", async () => {
    const consultas = simularBitacora();
    const { usuario } = mostrar();
    await screen.findAllByRole("row");

    await usuario.selectOptions(screen.getByRole("combobox", { name: "Módulo" }), "contabilidad");
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Acción" }), "UPDATE");

    await waitFor(() =>
      expect(consultas().at(-1)).toEqual({
        modulo: "contabilidad",
        accion: "UPDATE",
        pagina: "1",
        porPagina: "25",
      }),
    );
  });

  it("filtra por fechas con un rango rápido o personalizado", async () => {
    const consultas = simularBitacora();
    const { usuario } = mostrar();
    await screen.findAllByRole("row");

    await usuario.selectOptions(screen.getByRole("combobox", { name: "Fechas" }), "hoy");
    await waitFor(() => expect(consultas().at(-1)).toMatchObject({ desde: hoyIso(), hasta: hoyIso() }));

    await usuario.selectOptions(screen.getByRole("combobox", { name: "Fechas" }), "personalizado");
    const desde = screen.getByLabelText("Desde");
    const hasta = screen.getByLabelText("Hasta");
    await usuario.clear(desde);
    await usuario.type(desde, "2026-11-01");
    await usuario.clear(hasta);
    await usuario.type(hasta, "2026-11-10");
    await waitFor(() =>
      expect(consultas().at(-1)).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-10" }),
    );
  });

  it("si la fecha inicial es posterior a la final, avisa y no consulta", async () => {
    const consultas = simularBitacora();
    const { usuario } = mostrar();
    await screen.findAllByRole("row");

    await usuario.selectOptions(screen.getByRole("combobox", { name: "Fechas" }), "personalizado");
    await usuario.type(screen.getByLabelText("Desde"), "2026-11-10");
    const enviadas = consultas().length;
    await usuario.type(screen.getByLabelText("Hasta"), "2026-11-01");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La fecha inicial no puede ser posterior a la final.",
    );
    expect(consultas()).toHaveLength(enviadas);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("al elegir un usuario muestra solo sus cambios, y el filtro se puede quitar", async () => {
    const consultas = simularBitacora();
    const { usuario } = mostrar();
    await screen.findAllByRole("row");

    await usuario.click(screen.getByRole("button", { name: "María Rivas" }));
    await waitFor(() => expect(consultas().at(-1)).toMatchObject({ usuarioId: "u-maria" }));
    expect(screen.getByText("Usuario: María Rivas")).toBeInTheDocument();
    // Elegir el usuario no abre el detalle del cambio
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Quitar el filtro de María Rivas" }));
    await waitFor(() => expect(consultas().at(-1)).not.toHaveProperty("usuarioId"));
  });

  it("pagina con los botones y muestra el resumen", async () => {
    const consultas = simularBitacora((consulta) =>
      pagina([contabilizada], { total: 60, paginas: 3, pagina: Number(consulta.get("pagina")) }),
    );
    const { usuario } = mostrar();

    const paginacion = await screen.findByRole("navigation", { name: "Paginación de la bitácora" });
    expect(paginacion).toHaveTextContent("1–25 de 60");
    expect(paginacion).toHaveTextContent("Página 1 de 3");
    expect(within(paginacion).getByRole("button", { name: "Anterior" })).toBeDisabled();

    await usuario.click(within(paginacion).getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(paginacion).toHaveTextContent("Página 2 de 3"));
    expect(paginacion).toHaveTextContent("26–50 de 60");
    expect(consultas().at(-1)).toMatchObject({ pagina: "2" });
  });

  it("el detalle muestra cada campo antes y después, sin los identificadores internos", async () => {
    simularBitacora();
    const { usuario } = mostrar();

    await usuario.click(await screen.findByRole("button", { name: "Ver el detalle: Partida n.º 7" }));

    const detalle = screen.getByRole("dialog", { name: "Modificación · Partidas y períodos" });
    expect(detalle).toHaveTextContent("10/11/2026 16:42 · Carlos Guandique");
    const filas = within(detalle).getAllByRole("row");
    expect(filas.map((f) => f.textContent)).toEqual([
      "CampoAntesDespués",
      "Estadoborradorcontabilizada",
      "Número—7",
    ]);
    expect(detalle).toHaveTextContent("Los eventos de la bitácora no se pueden editar ni eliminar.");
  });

  it("desde el detalle se filtra por el usuario del cambio", async () => {
    const consultas = simularBitacora();
    const { usuario } = mostrar();

    await usuario.click(await screen.findByRole("button", { name: "Ver el detalle: Partida n.º 7" }));
    await usuario.click(screen.getByRole("button", { name: "Ver solo los cambios de Carlos Guandique" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(consultas().at(-1)).toMatchObject({ usuarioId: "u-carlos" }));
  });

  it("distingue una bitácora vacía de un filtro sin resultados", async () => {
    simularBitacora(() => pagina([]));
    const { usuario } = mostrar();

    expect(
      await screen.findByText("Todavía no hay cambios registrados en esta empresa."),
    ).toBeInTheDocument();
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Módulo" }), "catalogo");
    expect(await screen.findByText("Sin eventos con esos filtros.")).toBeInTheDocument();
  });

  it("si la API falla, explica el motivo y permite reintentar", async () => {
    simularApi({
      "GET /empresas/e1/bitacora": {
        estado: 403,
        cuerpo: { message: "Su rol no permite consultar la bitácora de esta empresa." },
      },
    });
    mostrar();

    expect(await screen.findByText(/Su rol no permite consultar la bitácora/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("presentación de la bitácora", () => {
  it("formatea la fecha y hora en El Salvador", () => {
    expect(formatearFechaHora("2026-11-10T22:42:00.000Z")).toBe("10/11/2026 16:42");
    expect(formatearFechaHora("2026-01-01T05:59:00Z")).toBe("31/12/2025 23:59");
  });

  it("describe cada tipo de registro", () => {
    const con = (tabla: string, datos: Record<string, unknown>) =>
      describirRegistro({ ...cuentaNueva, tabla, datosNuevos: datos }, t);
    expect(con("partidas", { numero: null, concepto: "Pago de agua" })).toBe(
      "Partida en borrador: Pago de agua",
    );
    expect(con("periodos", { mes: 3, fecha_inicio: "2026-03-01" })).toBe("Período 03/2026");
    expect(con("ejercicios", { anio: 2026 })).toBe("Ejercicio 2026");
    expect(con("sucursales", { nombre: "San Miguel Centro" })).toBe("San Miguel Centro");
    expect(con("membresias", {})).toBe("Acceso de un usuario");
  });

  it("al crear muestra los valores nuevos y al eliminar los que tenía", () => {
    expect(cambiosDe(cuentaNueva, t)).toEqual([
      { campo: "codigo", etiqueta: "Código", antes: "—", despues: "1101" },
      { campo: "nombre", etiqueta: "Nombre", antes: "—", despues: "Caja general" },
      { campo: "activa", etiqueta: "Activa", antes: "—", despues: "Sí" },
    ]);
    const eliminada = {
      ...cuentaNueva,
      accion: "DELETE" as const,
      datosAnteriores: cuentaNueva.datosNuevos,
      datosNuevos: null,
    };
    expect(cambiosDe(eliminada, t)[0]).toEqual({
      campo: "codigo",
      etiqueta: "Código",
      antes: "1101",
      despues: "—",
    });
  });

  it("da formato a fechas, booleanos y campos sin traducción", () => {
    expect(formatearValor("2026-11-10", t)).toBe("10/11/2026");
    expect(formatearValor(false, t)).toBe("No");
    expect(formatearValor(null, t)).toBe("—");
    const cambio = cambiosDe(
      { ...migracion, datosAnteriores: { campo_nuevo: 1 }, datosNuevos: { campo_nuevo: 2 } },
      t,
    );
    expect(cambio[0]?.etiqueta).toBe("Campo nuevo");
  });

  it("calcula los rangos rápidos de fechas desde hoy", () => {
    const ahora = new Date(2026, 10, 14, 10, 0);
    expect(fechasDeRango("todas", ahora)).toEqual({});
    expect(fechasDeRango("hoy", ahora)).toEqual({ desde: "2026-11-14", hasta: "2026-11-14" });
    expect(fechasDeRango("semana", ahora)).toEqual({ desde: "2026-11-08", hasta: "2026-11-14" });
    expect(fechasDeRango("mes", ahora)).toEqual({ desde: "2026-11-01", hasta: "2026-11-14" });
  });
});
