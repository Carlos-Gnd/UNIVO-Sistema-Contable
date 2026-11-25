import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { PreferenciaIdiomaUsuario } from "./preferencia-idioma.js";

function preparar(idiomaInicial: string | null = "es") {
  let idioma = idiomaInicial;
  const usuario = {
    findUnique: vi.fn(async ({ select }: { select: { id?: boolean; idioma?: boolean } }) => {
      if (idioma === null) return null;
      return select.id ? { id: "u-1" } : { idioma };
    }),
    update: vi.fn(async ({ data }: { data: { idioma: string } }) => {
      idioma = data.idioma;
      return { idioma };
    }),
  };
  const ejecutarRaw = vi.fn(async () => 1);
  const prisma = {
    usuario,
    $transaction: vi.fn(
      async (fn: (tx: { usuario: typeof usuario; $executeRaw: typeof ejecutarRaw }) => Promise<unknown>) =>
        fn({ usuario, $executeRaw: ejecutarRaw }),
    ),
  };
  return { servicio: new PreferenciaIdiomaUsuario({ prisma } as never), usuario, prisma };
}

describe("PreferenciaIdiomaUsuario", () => {
  it("consulta el idioma del perfil solicitado", async () => {
    const { servicio } = preparar("en");
    await expect(servicio.consultar("u-1")).resolves.toEqual({ idioma: "en" });
  });

  it("actualiza solo la preferencia del usuario autenticado dentro de su contexto", async () => {
    const { servicio, usuario, prisma } = preparar();
    await expect(servicio.actualizar("u-1", "en")).resolves.toEqual({ idioma: "en" });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(usuario.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { idioma: "en" },
      select: { idioma: true },
    });
  });

  it("responde no encontrado si el perfil ya no existe", async () => {
    const { servicio } = preparar(null);
    await expect(servicio.actualizar("u-1", "en")).rejects.toBeInstanceOf(NotFoundException);
  });
});
