import { ConflictException, Injectable } from "@nestjs/common";
import { comoUsuario } from "@contable/db";
import type { CrearEjercicio } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { exigirPermisoEmpresa } from "../../organizacion/application/acceso-organizacion.js";

function ejercicioDuplicado(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "P2002") return true;
  const mensaje = "message" in error && typeof error.message === "string" ? error.message : "";
  return /duplicate key|unique constraint|traslap|overlap/i.test(mensaje);
}

@Injectable()
export class AdministrarEjercicios {
  constructor(private readonly baseDatos: BaseDatos) {}

  async listar(usuarioId: string, empresaId: string) {
    await exigirPermisoEmpresa(
      this.baseDatos.prisma,
      empresaId,
      usuarioId,
      "partidas.ver",
      "No tiene permiso para consultar los ejercicios contables",
    );
    return this.baseDatos.prisma.ejercicio.findMany({
      where: { empresaId },
      include: { periodos: { orderBy: { mes: "asc" } } },
      orderBy: { anio: "desc" },
    });
  }

  async crear(usuarioId: string, empresaId: string, datos: CrearEjercicio) {
    await exigirPermisoEmpresa(
      this.baseDatos.prisma,
      empresaId,
      usuarioId,
      "periodos.cerrar",
      "No tiene permiso para crear ejercicios contables",
    );
    try {
      return await comoUsuario(this.baseDatos.prisma, usuarioId, (tx) =>
        tx.ejercicio.create({
          data: {
            empresaId,
            anio: datos.anio,
            fechaInicio: new Date(`${datos.fechaInicio}T00:00:00.000Z`),
            fechaFin: new Date(`${datos.fechaFin}T00:00:00.000Z`),
          },
          include: { periodos: { orderBy: { mes: "asc" } } },
        }),
      );
    } catch (error) {
      if (ejercicioDuplicado(error)) throw new ConflictException("Ya existe un ejercicio para ese año.");
      throw error;
    }
  }
}
