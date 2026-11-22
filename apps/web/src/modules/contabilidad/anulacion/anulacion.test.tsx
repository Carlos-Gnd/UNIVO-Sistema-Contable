import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { BotonAnular } from ".";

const E = "e1";
const P = "p1";
const ANULAR = `POST /empresas/${E}/partidas/${P}/anular`;
const CONTADOR: CodigoPermiso[] = ["partidas.ver", "partidas.contabilizar", "partidas.anular"];
const PARTIDA = { id: P, numero: 7, fecha: "2026-11-10" };

const abrir = (permisos: CodigoPermiso[] = CONTADOR, onAnulada = vi.fn()) => ({
  onAnulada,
  ...renderizar(<BotonAnular empresaId={E} partida={PARTIDA} onAnulada={onAnulada} />, { permisos }),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 20, 9, 0));
});
afterEach(() => vi.useRealTimers());

describe("diálogo de anulación (S2-T13)", () => {
  it("no se muestra sin el permiso partidas.anular", () => {
    simularApi({});
    abrir(["partidas.ver", "partidas.registrar"]);
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("exige el motivo antes de llamar a la API", async () => {
    const peticiones = simularApi({});
    const { usuario } = abrir();

    await usuario.click(screen.getByRole("button", { name: "Anular" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Anular la partida n.º 7?" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Anular partida" }));

    expect(within(dialogo).getByLabelText("Motivo de la anulación")).toHaveAccessibleDescription(
      "Este campo es obligatorio.",
    );
    expect(peticiones).toHaveLength(0);
  });

  it("anula con el motivo y la fecha de hoy, y avisa el número de la reversión", async () => {
    const peticiones = simularApi({
      [ANULAR]: {
        cuerpo: {
          original: { id: P, numero: 7, ambito: "2026" },
          reversion: { id: "r1", fecha: "2026-11-20", numero: 12, ambito: "2026" },
        },
      },
    });
    const { usuario, onAnulada } = abrir();

    await usuario.click(screen.getByRole("button", { name: "Anular" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByLabelText("Fecha de la reversión")).toHaveValue("2026-11-20");
    await usuario.type(within(dialogo).getByLabelText("Motivo de la anulación"), "Cuenta equivocada");
    await usuario.click(within(dialogo).getByRole("button", { name: "Anular partida" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(peticiones[0]?.cuerpo).toEqual({ motivo: "Cuenta equivocada", fecha: "2026-11-20" });
    expect(onAnulada).toHaveBeenCalledWith({ id: "r1", fecha: "2026-11-20", numero: 12, ambito: "2026" });
  });

  it("no acepta una fecha anterior a la de la partida", async () => {
    const peticiones = simularApi({});
    const { usuario } = abrir();

    await usuario.click(screen.getByRole("button", { name: "Anular" }));
    const dialogo = screen.getByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Motivo de la anulación"), "Duplicada");
    const fecha = within(dialogo).getByLabelText("Fecha de la reversión");
    await usuario.clear(fecha);
    await usuario.type(fecha, "2026-11-01");
    await usuario.click(within(dialogo).getByRole("button", { name: "Anular partida" }));

    expect(fecha).toHaveAccessibleDescription(/No puede ser anterior al 10\/11\/2026/);
    expect(peticiones).toHaveLength(0);
  });

  it("muestra el rechazo de la API, por ejemplo con el período cerrado", async () => {
    simularApi({
      [ANULAR]: { estado: 422, cuerpo: { message: "El período de noviembre de 2026 está cerrado." } },
    });
    const { usuario } = abrir();

    await usuario.click(screen.getByRole("button", { name: "Anular" }));
    const dialogo = screen.getByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Motivo de la anulación"), "Error");
    await usuario.click(within(dialogo).getByRole("button", { name: "Anular partida" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "El período de noviembre de 2026 está cerrado.",
    );
  });
});
