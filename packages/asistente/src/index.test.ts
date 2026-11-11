import { describe, expect, it } from "vitest";
import { AsistenteNoDisponible, asistenteHabilitado, proveedorNulo } from "./index";

describe("asistente (reservado)", () => {
  it("está apagado por defecto", () => {
    expect(asistenteHabilitado({})).toBe(false);
    expect(asistenteHabilitado({ ASISTENTE_HABILITADO: "true" })).toBe(true);
  });

  it("el proveedor nulo rechaza toda solicitud", async () => {
    await expect(proveedorNulo.sugerirCuentas("venta", [])).rejects.toBeInstanceOf(AsistenteNoDisponible);
  });
});
