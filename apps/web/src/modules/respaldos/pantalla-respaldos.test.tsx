import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { RespaldoVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaRespaldos } from "./pantalla-respaldos";

const E = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const RESPALDO = "33333333-3333-4333-8333-333333333333";
const PERMISOS: CodigoPermiso[] = ["respaldo.crear", "respaldo.restaurar", "sucursales.ver"];
const RUTA_RESPALDOS = `/empresas/${E}/respaldos`;
const RUTA_SUCURSALES = `/empresas/${E}/sucursales`;
const respaldo = (tipo: "empresa" | "sucursal" = "empresa"): RespaldoVista => ({
  id: tipo === "empresa" ? RESPALDO : "44444444-4444-4444-8444-444444444444",
  tipo,
  sucursalId: tipo === "sucursal" ? S : null,
  sucursal: tipo === "sucursal" ? "Usulután" : null,
  nombreArchivo: `respaldo_${tipo}_20261124T120000Z.json`,
  sha256: "a".repeat(64),
  creadoEn: "2026-11-24T12:00:00.000Z",
});

const abrir = (permisos: CodigoPermiso[] = PERMISOS) =>
  renderizar(<PantallaRespaldos parametros={{ empresaId: E }} />, { permisos });

function prepararDescarga() {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:respaldo"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
}

describe("pantalla de respaldos (HU-13, S3-T02)", () => {
  it("crea el respaldo completo, descarga su archivo y envía el alcance exacto", async () => {
    prepararDescarga();
    const peticiones = simularApi({
      ["GET " + RUTA_RESPALDOS]: { cuerpo: [] },
      ["POST " + RUTA_RESPALDOS]: { estado: 201, cuerpo: respaldo() },
      [`GET ${RUTA_RESPALDOS}/${RESPALDO}/archivo`]: {
        archivo: new Blob([JSON.stringify({ sha256: "a".repeat(64) })]),
        cabeceras: { "Content-Disposition": `attachment; filename="${respaldo().nombreArchivo}"` },
      },
    });
    const { usuario } = abrir();
    await screen.findByText("Todavía no hay respaldos para esta empresa.");
    await usuario.click(screen.getByRole("button", { name: "Crear y descargar respaldo" }));

    expect(await screen.findByText("Respaldo creado y descargado.")).toBeInTheDocument();
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({});
    expect(peticiones.some((peticion) => peticion.ruta === `${RUTA_RESPALDOS}/${RESPALDO}/archivo`)).toBe(
      true,
    );
    vi.restoreAllMocks();
  });

  it("permite exportar solo la sucursal elegida", async () => {
    prepararDescarga();
    const peticiones = simularApi({
      ["GET " + RUTA_RESPALDOS]: { cuerpo: [] },
      ["GET " + RUTA_SUCURSALES]: {
        cuerpo: [{ id: S, nombre: "Usulután", codigoEstablecimiento: "M002", activa: true }],
      },
      ["POST " + RUTA_RESPALDOS]: { estado: 201, cuerpo: respaldo("sucursal") },
      [`GET ${RUTA_RESPALDOS}/${respaldo("sucursal").id}/archivo`]: {
        archivo: new Blob(["{}"]),
      },
    });
    const { usuario } = abrir();
    await screen.findByText("Todavía no hay respaldos para esta empresa.");
    await usuario.selectOptions(screen.getByLabelText("Alcance del respaldo"), "sucursal");
    await usuario.selectOptions(await screen.findByLabelText("Una sucursal"), S);
    await usuario.click(screen.getByRole("button", { name: "Crear y descargar respaldo" }));

    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({ sucursalId: S });
    vi.restoreAllMocks();
  });

  it("pide confirmación literal, restaura respaldos completos y bloquea los de sucursal", async () => {
    const peticiones = simularApi({
      ["GET " + RUTA_RESPALDOS]: { cuerpo: [respaldo(), respaldo("sucursal")] },
      [`POST ${RUTA_RESPALDOS}/${RESPALDO}/restaurar`]: {
        estado: 201,
        cuerpo: { tablasRestauradas: 4, filasRestauradas: 12 },
      },
    });
    const { usuario } = abrir();
    const botonEmpresa = await screen.findByRole("button", { name: `Restaurar ${respaldo().nombreArchivo}` });
    const botonSucursal = screen.getByRole("button", {
      name: `Restaurar ${respaldo("sucursal").nombreArchivo}`,
    });
    expect(botonSucursal).toBeDisabled();

    await usuario.click(botonEmpresa);
    const confirmar = screen.getByRole("button", { name: "Restaurar empresa" });
    expect(confirmar).toBeDisabled();
    await usuario.type(screen.getByLabelText("Escribe RESTAURAR para confirmar"), "RESTAURAR");
    await usuario.click(confirmar);

    expect(await screen.findByText("Restauración completada. Filas agregadas: 12.")).toBeInTheDocument();
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      confirmacion: "RESTAURAR",
    });
    vi.restoreAllMocks();
  });

  it("no consulta datos cuando la persona no tiene permisos", async () => {
    const peticiones = simularApi({});
    abrir([]);
    expect(
      await screen.findByText("No tienes permiso para consultar respaldos en esta empresa."),
    ).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });
});
