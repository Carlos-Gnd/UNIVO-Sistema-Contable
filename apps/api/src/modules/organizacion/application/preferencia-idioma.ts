import { Injectable, NotFoundException } from "@nestjs/common";
import { comoUsuario } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";

/** Consulta y actualiza el idioma del perfil autenticado (HU-14, S4-T01). */
@Injectable()
export class PreferenciaIdiomaUsuario {
  constructor(private readonly baseDatos: BaseDatos) {}

  async consultar(usuarioId: string): Promise<{ idioma: string }> {
    const perfil = await this.baseDatos.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { idioma: true },
    });
    // Un usuario autenticado puede no tener perfil hasta que registre su primera empresa.
    return perfil ?? { idioma: "es" };
  }

  async actualizar(usuarioId: string, idioma: "es" | "en"): Promise<{ idioma: string }> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      const perfil = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
      if (!perfil) throw new NotFoundException("No se encontró el perfil del usuario.");
      return tx.usuario.update({ where: { id: usuarioId }, data: { idioma }, select: { idioma: true } });
    });
  }
}
