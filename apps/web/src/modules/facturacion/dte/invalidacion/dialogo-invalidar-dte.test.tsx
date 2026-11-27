import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorApi } from "@/lib/api";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { renderizar } from "@/test/render";
import { DialogoInvalidarDte, type DocumentoDteParaInvalidar } from ".";

const DOCUMENTO: DocumentoDteParaInvalidar = {
  id: "dte-1",
  tipo: "03 · Comprobante de crédito fiscal",
  numeroControl: "DTE-03-M001P001-000000000000001",
  receptor: "Tecno Plaza San Miguel, S.A. de C.V.",
  fecha: "2026-11-08",
  total: "3096.77",
};
const PERMISOS: CodigoPermiso[] = ["dte.ver", "dte.invalidar"];

function abrir(onInvalidar = vi.fn().mockResolvedValue(undefined), permisos = PERMISOS) {
  return {
    onInvalidar,
    ...renderizar(<DialogoInvalidarDte documento={DOCUMENTO} onInvalidar={onInvalidar} />, { permisos }),
  };
}

describe("diálogo de invalidación de DTE (S4-T17)", () => {
  it("no muestra la acción a un usuario sin permiso para invalidar DTE", () => {
    abrir(vi.fn(), ["dte.ver"]);

    expect(screen.queryByRole("button", { name: "Invalidar documento" })).not.toBeInTheDocument();
  });

  it("muestra los datos del DTE y exige un motivo antes de confirmar", async () => {
    const { usuario, onInvalidar } = abrir();

    await usuario.click(screen.getByRole("button", { name: "Invalidar documento" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Invalidar este documento?" });
    expect(within(dialogo).getByText(DOCUMENTO.numeroControl)).toBeInTheDocument();
    expect(within(dialogo).getByText("3,096.77")).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar invalidación" }));

    expect(within(dialogo).getByLabelText("Motivo de la invalidación")).toHaveAccessibleDescription(
      "Escribe el motivo de la invalidación.",
    );
    expect(onInvalidar).not.toHaveBeenCalled();
  });

  it("envía el motivo limpio y cierra el diálogo al completar la invalidación", async () => {
    const onInvalidar = vi.fn().mockResolvedValue(undefined);
    const { usuario } = abrir(onInvalidar);

    await usuario.click(screen.getByRole("button", { name: "Invalidar documento" }));
    const dialogo = screen.getByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Motivo de la invalidación"), "  Emisión duplicada  ");
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar invalidación" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onInvalidar).toHaveBeenCalledWith({ documentoId: "dte-1", motivo: "Emisión duplicada" });
  });

  it("mantiene el diálogo abierto y muestra el error si falla la invalidación", async () => {
    const onInvalidar = vi.fn().mockRejectedValue(new ErrorApi(422, "El período está cerrado."));
    const { usuario } = abrir(onInvalidar);

    await usuario.click(screen.getByRole("button", { name: "Invalidar documento" }));
    const dialogo = screen.getByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Motivo de la invalidación"), "Emisión duplicada");
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar invalidación" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("El período está cerrado.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
