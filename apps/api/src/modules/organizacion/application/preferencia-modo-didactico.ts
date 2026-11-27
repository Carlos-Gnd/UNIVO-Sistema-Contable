import { Injectable, NotFoundException } from "@nestjs/common";
import { comoUsuario } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";

/** Preferencia didáctica del perfil autenticado (HU-89, S4-T37). */
@Injectable()
export class PreferenciaModoDidactico {
  constructor(private readonly baseDatos: BaseDatos) {}

  async consultar(usuarioId: string): Promise<{ activo: boolean }> {
    const perfil = await this.baseDatos.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { modoDidactico: true },
    });
    return { activo: perfil?.modoDidactico ?? false };
  }

  async actualizar(usuarioId: string, activo: boolean): Promise<{ activo: boolean }> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      const perfil = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
      if (!perfil) throw new NotFoundException("No se encontró el perfil del usuario.");
      const actualizado = await tx.usuario.update({
        where: { id: usuarioId },
        data: { modoDidactico: activo },
        select: { modoDidactico: true },
      });
      return { activo: actualizado.modoDidactico };
    });
  }
}
