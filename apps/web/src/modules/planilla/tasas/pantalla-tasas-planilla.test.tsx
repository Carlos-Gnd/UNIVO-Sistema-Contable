import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { ConfiguracionPlanillaVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaTasasPlanilla } from "./pantalla-tasas-planilla";

const E = "11111111-1111-4111-8111-111111111111";
const ADMIN: CodigoPermiso[] = ["empresa.configurar"];
const GET_TASAS = `GET /empresas/${E}/tasas-planilla`;
const inicial: ConfiguracionPlanillaVista = {
  id: "22222222-2222-4222-8222-222222222222",
  vigenteDesde: "2026-01-01",
  tasaIsssLaboral: "3.00",
  tasaIsssPatronal: "7.50",
  techoIsss: "1000.00",
  tasaAfpLaboral: "7.25",
  tasaAfpPatronal: "8.75",
  tramos: [
    { desde: "0.00", hasta: "550.00", porcentaje: "0.00", cuotaFija: "0.00" },
    { desde: "550.00", hasta: "895.24", porcentaje: "10.00", cuotaFija: "17.67" },
    { desde: "895.24", hasta: "2038.10", porcentaje: "20.00", cuotaFija: "60.00" },
    { desde: "2038.10", hasta: null, porcentaje: "30.00", cuotaFija: "288.57" },
  ],
};

const abrir = (permisos: CodigoPermiso[] = ADMIN) =>
  renderizar(<PantallaTasasPlanilla parametros={{ empresaId: E }} />, { permisos });

describe("pantalla de tasas de planilla (HU-71, S3-T98)", () => {
  it("muestra tasas iniciales e historial, y no consulta cuando falta permiso", async () => {
    simularApi({ [GET_TASAS]: { cuerpo: [inicial] } });
    abrir();
    expect(await screen.findByText("3.00%", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("US$ 1,000.00")).toBeInTheDocument();
    expect(screen.getByText(/01\/01\/2026/)).toBeInTheDocument();
    expect(screen.getByText("US$ 288.57")).toBeInTheDocument();

    const peticiones = simularApi({ [GET_TASAS]: { cuerpo: [inicial] } });
    abrir([]);
    expect(
      await screen.findByText("No tienes permiso para consultar o cambiar las tasas de esta empresa."),
    ).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("reintenta una consulta fallida y muestra una tabla vacía", async () => {
    let llamadas = 0;
    simularApi({
      [GET_TASAS]: () => {
        llamadas += 1;
        return llamadas === 1 ? { estado: 500, cuerpo: { message: "Error de prueba" } } : { cuerpo: [] };
      },
    });
    const { usuario } = abrir();
    expect(await screen.findByText(/No se pudieron cargar las tasas de planilla/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No hay configuraciones de planilla.")).toBeInTheDocument();
  });

  it("valida los tramos y envía la versión completa con fecha y valores exactos", async () => {
    let historial = [inicial];
    const peticiones = simularApi({
      [GET_TASAS]: () => ({ cuerpo: historial }),
      [`POST /empresas/${E}/tasas-planilla`]: ({ cuerpo }) => {
        const nueva = {
          ...(cuerpo as Omit<ConfiguracionPlanillaVista, "id">),
          id: "33333333-3333-4333-8333-333333333333",
        };
        historial = [nueva, ...historial];
        return { estado: 201, cuerpo: nueva };
      },
    });
    const { usuario } = abrir();
    await screen.findByText(/01\/01\/2026/);
    await usuario.click(screen.getByRole("button", { name: "Nueva vigencia" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar tasas" }));
    expect(
      await within(dialogo).findByText("La fecha debe tener el formato AAAA-MM-DD."),
    ).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);

    fireEvent.change(within(dialogo).getByLabelText("Vigente desde"), { target: { value: "2027-01-01" } });
    fireEvent.change(within(dialogo).getByLabelText("ISSS laboral (%)"), { target: { value: "4.00" } });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar tasas" }));

    expect(await screen.findByText(/01\/01\/2027/)).toBeInTheDocument();
    const peticion = peticiones.find((p) => p.metodo === "POST")!;
    expect(peticion.cuerpo).toEqual({
      vigenteDesde: "2027-01-01",
      tasaIsssLaboral: "4.00",
      tasaIsssPatronal: "7.50",
      techoIsss: "1000.00",
      tasaAfpLaboral: "7.25",
      tasaAfpPatronal: "8.75",
      tramos: [
        { desde: "0.00", hasta: "550.00", porcentaje: "0.00", cuotaFija: "0.00" },
        { desde: "550.00", hasta: "895.24", porcentaje: "10.00", cuotaFija: "17.67" },
        { desde: "895.24", hasta: "2038.10", porcentaje: "20.00", cuotaFija: "60.00" },
        { desde: "2038.10", hasta: null, porcentaje: "30.00", cuotaFija: "288.57" },
      ],
    });
  });

  it("muestra el rechazo de una fecha duplicada", async () => {
    simularApi({
      [GET_TASAS]: { cuerpo: [inicial] },
      [`POST /empresas/${E}/tasas-planilla`]: {
        estado: 409,
        cuerpo: { message: "Ya existe una configuración de planilla para esa fecha." },
      },
    });
    const { usuario } = abrir();
    await screen.findByText(/01\/01\/2026/);
    await usuario.click(screen.getByRole("button", { name: "Nueva vigencia" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Vigente desde"), { target: { value: "2026-01-01" } });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar tasas" }));
    expect(
      await within(dialogo).findByText("Ya existe una configuración de planilla para esa fecha."),
    ).toBeInTheDocument();
  });
});
