import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { ResultadoPlanillasOficialesVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaPlanillasOficiales } from "./pantalla-planillas-oficiales";

const E = "11111111-1111-4111-8111-111111111111";
const RUTA = `/empresas/${E}/planillas-oficiales`;
const VER: CodigoPermiso[] = ["planilla.ver"];
const EDITAR: CodigoPermiso[] = ["planilla.ver", "planilla.calcular"];

const reporte = (presentada = false): ResultadoPlanillasOficialesVista => ({
  periodo: "2026-11",
  empleados: [
    {
      empleadoId: "22222222-2222-4222-8222-222222222222",
      nombres: "Ana",
      apellidos: "Pérez",
      nombreCompleto: "Ana Pérez",
      dui: "01234567-8",
      numeroIsss: "ISSS-001",
      nup: "NUP-001",
      salarioCotizable: "450.00",
      isssLaboral: "13.50",
      isssPatronal: "33.75",
      afpLaboral: "32.63",
      afpPatronal: "39.38",
    },
  ],
  totales: {
    isss: { salarioCotizable: "450.00", laboral: "13.50", patronal: "33.75", total: "47.25" },
    afp: { salarioCotizable: "450.00", laboral: "32.63", patronal: "39.38", total: "72.01" },
  },
  presentaciones: presentada
    ? { afp: { tipo: "afp", presentadaEn: "2026-11-30T18:00:00.000Z", presentadaPor: "Carlos Granados" } }
    : {},
});

const abrir = (permisos: CodigoPermiso[] = EDITAR) =>
  renderizar(<PantallaPlanillasOficiales parametros={{ empresaId: E }} />, { permisos });

describe("pantalla de planillas oficiales (HU-75, S3-T110)", () => {
  it("muestra la pestaña ISSS, el total y el formato genérico", async () => {
    simularApi({ [`GET ${RUTA}`]: { cuerpo: reporte() } });
    abrir(VER);

    expect(await screen.findByRole("tab", { name: "ISSS" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getAllByText("US$ 13.50")).toHaveLength(2);
    expect(screen.getAllByText("US$ 33.75")).toHaveLength(2);
    expect(screen.getAllByText("US$ 47.25")).toHaveLength(2);
    expect(screen.getByText(/formato genérico/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar presentación" })).not.toBeInTheDocument();
  });

  it("cambia a AFP, registra la presentación con el cuerpo exacto y actualiza su estado", async () => {
    let presentada = false;
    const peticiones = simularApi({
      [`GET ${RUTA}`]: () => ({ cuerpo: reporte(presentada) }),
      [`POST ${RUTA}/presentar`]: ({ cuerpo }) => {
        expect(cuerpo).toEqual({ periodo: "2026-11", tipo: "afp" });
        presentada = true;
        return {
          cuerpo: { tipo: "afp", presentadaEn: "2026-11-30T18:00:00.000Z", presentadaPor: "Carlos Granados" },
        };
      },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("tab", { name: "AFP" }));
    expect(await screen.findAllByText("US$ 32.63")).toHaveLength(2);
    expect(screen.getAllByText("US$ 39.38")).toHaveLength(2);
    expect(screen.getAllByText("US$ 72.01")).toHaveLength(2);
    await usuario.click(screen.getByRole("button", { name: "Registrar presentación" }));
    expect(await screen.findByText(/Presentada · .* por Carlos Granados/)).toBeInTheDocument();
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      periodo: "2026-11",
      tipo: "afp",
    });
    expect(screen.queryByRole("button", { name: "Registrar presentación" })).not.toBeInTheDocument();
  });

  it("muestra vacío, error con reintento y oculta acciones si falla el permiso", async () => {
    simularApi({
      [`GET ${RUTA}`]: { cuerpo: { periodo: "2026-11", empleados: [], totales: {}, presentaciones: {} } },
    });
    abrir();
    expect(await screen.findByText(/Todavía no hay cálculos de planilla/)).toBeInTheDocument();

    let llamadas = 0;
    simularApi({
      [`GET ${RUTA}`]: () => {
        llamadas += 1;
        return llamadas === 1
          ? { estado: 500, cuerpo: { message: "Error de prueba" } }
          : { cuerpo: reporte() };
      },
    });
    abrir(VER);
    expect(await screen.findByText(/No se pudieron cargar las planillas/)).toBeInTheDocument();
    await usuarioReintentar();
    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
  });
});

async function usuarioReintentar() {
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
}
