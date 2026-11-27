import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PreferenciaModoDidactico } from "./preferencia-modo-didactico.js";

function caso(perfil: { modoDidactico: boolean } | null = null) {
  const update = vi.fn().mockResolvedValue({ modoDidactico: true });
  const findUnique = vi.fn().mockResolvedValue(perfil ? { id: "usuario-1", ...perfil } : null);
  type TxMock = {
    usuario: { findUnique: typeof findUnique; update: typeof update };
    $executeRaw: ReturnType<typeof vi.fn>;
  };
  const tx: TxMock = { usuario: { findUnique, update }, $executeRaw: vi.fn() };
  const transaccion = vi.fn(async (operacion: (tx: TxMock) => Promise<unknown>) => operacion(tx));
  const baseDatos = {
    prisma: {
      usuario: { findUnique },
      $transaction: transaccion,
    },
  };
  return {
    servicio: new PreferenciaModoDidactico(baseDatos as never),
    findUnique,
    update,
    baseDatos,
    transaccion,
  };
}

describe("PreferenciaModoDidactico", () => {
  it("devuelve desactivado por defecto si aún no existe perfil", async () => {
    const { servicio } = caso();
    await expect(servicio.consultar("usuario-1")).resolves.toEqual({ activo: false });
  });

  it("consulta el valor guardado en el perfil", async () => {
    const { servicio } = caso({ modoDidactico: true });
    await expect(servicio.consultar("usuario-1")).resolves.toEqual({ activo: true });
  });

  it("actualiza la preferencia dentro del contexto autenticado", async () => {
    const { servicio, update, transaccion } = caso({ modoDidactico: false });
    await expect(servicio.actualizar("usuario-1", true)).resolves.toEqual({ activo: true });
    expect(transaccion).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      where: { id: "usuario-1" },
      data: { modoDidactico: true },
      select: { modoDidactico: true },
    });
  });

  it("rechaza actualizar cuando no existe el perfil", async () => {
    const { servicio, update } = caso();
    await expect(servicio.actualizar("usuario-1", true)).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
