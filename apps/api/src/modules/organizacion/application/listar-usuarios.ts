import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { PrismaClient } from "@contable/db";
import type { MiembroEmpresa, RolEmpresa } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { exigirPermisoEmpresa } from "./acceso-organizacion.js";

/** Usuarios con membresía activa en la empresa, con su rol y sucursales (HU-08, pantalla S1-T48). */
@Injectable()
export class ListarUsuariosEmpresa {
  constructor(private readonly baseDatos: BaseDatos) {}

  async ejecutar(empresaId: string, actorId: string): Promise<MiembroEmpresa[]> {
    let prisma: PrismaClient;
    try {
      prisma = this.baseDatos.prisma;
    } catch {
      throw new ServiceUnavailableException("Falta configurar DATABASE_URL");
    }

    await exigirPermisoEmpresa(
      prisma,
      empresaId,
      actorId,
      "usuarios.gestionar",
      "No tiene permiso para ver los usuarios de esta empresa",
    );

    try {
      const membresias = await prisma.membresia.findMany({
        where: { empresaId, activa: true },
        select: {
          todasSucursales: true,
          creadoEn: true,
          usuario: { select: { id: true, nombre: true, correo: true } },
          rol: { select: { codigo: true } },
          sucursales: { select: { sucursalId: true } },
        },
        orderBy: { usuario: { nombre: "asc" } },
      });
      return membresias.map((m) => ({
        usuarioId: m.usuario.id,
        nombre: m.usuario.nombre,
        correo: m.usuario.correo,
        rol: m.rol.codigo as RolEmpresa,
        todasSucursales: m.todasSucursales,
        sucursales: m.todasSucursales ? [] : m.sucursales.map((s) => s.sucursalId),
        desde: m.creadoEn.toISOString(),
      }));
    } catch {
      throw new ServiceUnavailableException("No se pudieron consultar los usuarios de la empresa");
    }
  }
}
