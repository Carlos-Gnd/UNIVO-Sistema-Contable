import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PlantillaRecurrenteVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaRecurrentes } from "./pantalla-recurrentes";

const E = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const PARTIDA = "33333333-3333-4333-8333-333333333333";
const GET = `GET /empresas/${E}/partidas-recurrentes`;
const REGISTRAR: CodigoPermiso[] = ["partidas.ver", "partidas.registrar"];

const alquiler: PlantillaRecurrenteVista = {
  id: P,
  nombre: "Alquiler del local",
  concepto: "Pago de alquiler",
  tipo: "operacion",
  sucursalId: "44444444-4444-4444-8444-444444444444",
  sucursalNombre: "Casa matriz",
  activa: true,
  lineas: [
    {
      cuentaId: "55555555-5555-4555-8555-555555555555",
      cuentaCodigo: "5101",
      cuentaNombre: "Alquileres",
      debe: "300.00",
      haber: "0.00",
    },
    {
      cuentaId: "66666666-6666-4666-8666-666666666666",
      cuentaCodigo: "110101",
      cuentaNombre: "Caja general",
      debe: "0.00",
      haber: "300.00",
    },
  ],
  ultimaGeneracion: { partidaId: PARTIDA, fecha: "2026-10-05", estado: "borrador" },
};

const abrir = (permisos: CodigoPermiso[] = REGISTRAR) =>
  renderizar(<PantallaRecurrentes parametros={{ empresaId: E }} />, { permisos });

describe("pantalla de partidas recurrentes (HU-26, S3-T05)", () => {
  it("lista las plantillas con sus líneas y la última generación", async () => {
    simularApi({ [GET]: { cuerpo: [alquiler] } });
    abrir();
    expect(await screen.findByText("Alquiler del local")).toBeInTheDocument();
    expect(screen.getByText(/5101 Alquileres/)).toBeInTheDocument();
    expect(screen.getAllByText("US$ 300.00")).toHaveLength(2);
    expect(screen.getByText(/Última partida generada: 05\/10\/2026/)).toBeInTheDocument();
  });

  it("muestra el vacío, el error con reintento y el aviso sin permiso", async () => {
    simularApi({ [GET]: { cuerpo: [] } });
    abrir();
    expect(await screen.findByText(/Todavía no hay plantillas/)).toBeInTheDocument();

    let llamadas = 0;
    simularApi({
      [GET]: () =>
        ++llamadas === 1 ? { estado: 500, cuerpo: { mensaje: "falló" } } : { cuerpo: [alquiler] },
    });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Alquiler del local")).toBeInTheDocument();

    const peticiones = simularApi({ [GET]: { cuerpo: [] } });
    abrir([]);
    expect(await screen.findByText(/No tienes permiso para consultar/)).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("quien solo consulta no ve los botones de crear ni de generar", async () => {
    simularApi({ [GET]: { cuerpo: [alquiler] } });
    abrir(["partidas.ver"]);
    await screen.findByText("Alquiler del local");
    expect(screen.queryByRole("button", { name: "Nueva plantilla" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar partida del mes" })).not.toBeInTheDocument();
  });

  it("crea una plantilla desde una partida y envía el cuerpo exacto", async () => {
    const peticiones = simularApi({
      [GET]: { cuerpo: [] },
      [`POST /empresas/${E}/partidas-recurrentes`]: { estado: 201, cuerpo: alquiler },
    });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Nueva plantilla" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear plantilla" }));
    expect(await screen.findAllByText("Este campo es obligatorio.")).not.toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Identificador de la partida"), { target: { value: PARTIDA } });
    fireEvent.change(screen.getByLabelText("Nombre de la plantilla"), {
      target: { value: "Alquiler del local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear plantilla" }));
    await waitFor(() =>
      expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
        partidaId: PARTIDA,
        nombre: "Alquiler del local",
      }),
    );
  });

  it("genera el borrador del mes y muestra el rechazo cuando ya existe (409)", async () => {
    let intento = 0;
    const peticiones = simularApi({
      [GET]: { cuerpo: [alquiler] },
      [`POST /empresas/${E}/partidas-recurrentes/${P}/generar`]: () =>
        ++intento === 1
          ? { estado: 409, cuerpo: { mensaje: "La plantilla ya generó una partida vigente en ese mes." } }
          : { estado: 201, cuerpo: { partidaId: PARTIDA, fecha: "2026-11-05", estado: "borrador" } },
    });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Generar partida del mes" }));
    fireEvent.change(screen.getByLabelText("Fecha de la partida"), { target: { value: "2026-11-05" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Generar partida del mes" }).at(-1)!);
    expect(await screen.findByText(/ya generó una partida vigente/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Generar partida del mes" }).at(-1)!);
    await waitFor(() => expect(peticiones.filter((p) => p.metodo === "POST")).toHaveLength(2));
    expect(peticiones.filter((p) => p.metodo === "POST")[1]?.cuerpo).toEqual({ fecha: "2026-11-05" });
  });
});
