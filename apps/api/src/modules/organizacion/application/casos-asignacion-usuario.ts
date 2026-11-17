import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { comoUsuario, type PrismaClient, type Tx } from "@contable/db";
import type { AsignarRolUsuario as DatosAsignacion } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { exigirPermisoEmpresa } from "./acceso-organizacion.js";

@Injectable()
export class AsignarRolUsuario {
  constructor(private readonly baseDatos: BaseDatos) {}

  async ejecutar(
    empresaId: string,
    miembroId: string,
    actorId: string,
    datos: DatosAsignacion,
  ): Promise<{ mensaje: string }> {
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
      "No tiene permiso para asignar roles en esta empresa",
    );

    try {
      await comoUsuario(prisma, actorId, async (tx) => {
        await exigirPermisoEmpresa(
          tx,
          empresaId,
          actorId,
          "usuarios.gestionar",
          "No tiene permiso para asignar roles en esta empresa",
        );

        const membresia = await tx.membresia.findUnique({
          where: { usuarioId_empresaId: { usuarioId: miembroId, empresaId } },
          select: { id: true, activa: true },
        });
        if (!membresia?.activa)
          throw new NotFoundException("No se encontró una membresía activa en esta empresa");

        const rol = await tx.rol.findUnique({ where: { codigo: datos.rol }, select: { id: true } });
        if (!rol)
          throw new ServiceUnavailableException("No se encontró el rol solicitado en la base de datos");

        if (datos.rol !== "administrador") await protegerUltimoAdministrador(tx, empresaId, miembroId);

        if (datos.sucursales.length > 0) {
          const sucursales = await tx.$queryRaw<{ cantidad: number }[]>`
            SELECT count(*)::int AS cantidad
            FROM sucursales
            WHERE empresa_id = ${empresaId}::uuid
              AND activa
              AND id = ANY(${datos.sucursales}::uuid[])`;
          if (sucursales[0]?.cantidad !== datos.sucursales.length) {
            throw new BadRequestException(
              "Una o más sucursales no pertenecen a la empresa o están inactivas",
            );
          }
        }

        await tx.membresia.update({
          where: { id: membresia.id },
          data: {
            rolId: rol.id,
            todasSucursales: datos.rol === "administrador" || datos.rol === "contador",
          },
        });
        await tx.membresiaSucursal.deleteMany({ where: { membresiaId: membresia.id } });
        if (datos.sucursales.length > 0) {
          await tx.membresiaSucursal.createMany({
            data: datos.sucursales.map((sucursalId) => ({ membresiaId: membresia.id, sucursalId })),
          });
        }
      });
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException("No se pudo actualizar el rol y las sucursales del usuario");
    }

    return { mensaje: "Rol y sucursales del usuario actualizados." };
  }
}

async function protegerUltimoAdministrador(tx: Tx, empresaId: string, miembroId: string): Promise<void> {
  // Se bloquean todas las membresías activas en orden estable: dos cambios concurrentes de rol
  // para la misma empresa no pueden considerar obsoleto el conteo de administradores.
  const membresias = await tx.$queryRaw<{ usuario_id: string; rol: string }[]>`
    SELECT m.usuario_id, r.codigo AS rol
    FROM membresias m
    JOIN roles r ON r.id = m.rol_id
    WHERE m.empresa_id = ${empresaId}::uuid AND m.activa
    ORDER BY m.id
    FOR UPDATE OF m`;
  const administradores = membresias.filter((fila) => fila.rol === "administrador");
  if (administradores.length === 1 && administradores[0]?.usuario_id === miembroId) {
    throw new ConflictException("La empresa debe conservar al menos un administrador.");
  }
}
