import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "@/App";
import { simularApi } from "@/test/api-simulada";

describe("ruta pública /verificar (HU-88, S4-T35)", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("se abre sin sesión, sin pedir login ni mostrar el layout del sistema", async () => {
    simularApi({});
    window.history.replaceState(null, "", "/verificar");
    render(<App auth={null} />);
    expect(await screen.findByRole("heading", { name: "Verifica un documento" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/verificar");
  });

  it("con el código del QR en la ruta consulta la API pública sin sesión", async () => {
    const peticiones = simularApi({
      "GET /verificacion/ABCD-2345-WXYZ": { estado: 404, cuerpo: { mensaje: "No existe" } },
    });
    window.history.replaceState(null, "", "/verificar/abcd-2345-wxyz");
    render(<App auth={null} />);
    expect(await screen.findByText("No encontramos ese código.")).toBeInTheDocument();
    expect(peticiones[0]?.cabeceras["Authorization"]).toBeUndefined();
  });
});
