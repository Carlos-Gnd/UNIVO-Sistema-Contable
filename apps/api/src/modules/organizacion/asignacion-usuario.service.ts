import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { comoUsuario, type PrismaClient, type Tx } from "@contable/db";
import type { AsignarRolUsuario } from "@contable/shared";
import { BaseDatos } from "../../compartido/base-datos.js";

@Injectable()
export class AsignacionUsuarioService {
  constructor(private readonly baseDatos: BaseDatos) {}

  async asignar(
    empresaId: string,
    miembroId: string,
    actorId: string,
    datos: AsignarRolUsuario,
  ): Promise<{ mensaje: string }> {
    let prisma: PrismaClient;
    try {
      prisma = this.baseDatos.prisma;
    } catch {
      throw new ServiceUnavailableException("Falta configurar DATABASE_URL");
    }

    await this.verificarAcceso(prisma, empresaId, actorId);

    try {
      await comoUsuario(prisma, actorId, async (tx) => {
        await this.verificarAccesoTx(tx, empresaId, actorId);

        const membresia = await tx.membresia.findUnique({
          where: { usuarioId_empresaId: { usuarioId: miembroId, empresaId } },
          select: { id: true, activa: true },
        });
        if (!membresia?.activa)
          throw new NotFoundException("No se encontró una membresía activa en esta empresa");

        const rol = await tx.rol.findUnique({ where: { codigo: datos.rol }, select: { id: true } });
        if (!rol)
          throw new ServiceUnavailableException("No se encontró el rol solicitado en la base de datos");

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
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException("No se pudo actualizar el rol y las sucursales del usuario");
    }

    return { mensaje: "Rol y sucursales del usuario actualizados." };
  }

  private async verificarAcceso(prisma: PrismaClient, empresaId: string, usuarioId: string): Promise<void> {
    let filas: { permitido: boolean; empresa_activa: boolean }[];
    try {
      filas = await prisma.$queryRaw<{ permitido: boolean; empresa_activa: boolean }[]>`
        SELECT
          EXISTS (
            SELECT 1 FROM permisos_usuario
            WHERE usuario_id = ${usuarioId}::uuid
              AND empresa_id = ${empresaId}::uuid
              AND permiso = 'usuarios.gestionar'
          ) AS permitido,
          EXISTS (SELECT 1 FROM empresas WHERE id = ${empresaId}::uuid AND activa) AS empresa_activa`;
    } catch {
      throw new ServiceUnavailableException("No se pudo verificar el acceso a la empresa");
    }
    this.validarAcceso(filas, "No tiene permiso para asignar roles en esta empresa");
  }

  private async verificarAccesoTx(tx: Tx, empresaId: string, usuarioId: string): Promise<void> {
    const filas = await tx.$queryRaw<{ permitido: boolean; empresa_activa: boolean }[]>`
      SELECT
        EXISTS (
          SELECT 1 FROM permisos_usuario
          WHERE usuario_id = ${usuarioId}::uuid
            AND empresa_id = ${empresaId}::uuid
            AND permiso = 'usuarios.gestionar'
        ) AS permitido,
        EXISTS (SELECT 1 FROM empresas WHERE id = ${empresaId}::uuid AND activa) AS empresa_activa`;
    this.validarAcceso(filas, "No tiene permiso para asignar roles en esta empresa");
  }

  private validarAcceso(
    filas: { permitido: boolean; empresa_activa: boolean }[],
    mensajePermiso: string,
  ): void {
    if (!filas[0]?.permitido) throw new ForbiddenException(mensajePermiso);
    if (!filas[0]?.empresa_activa) throw new NotFoundException("No se encontró una empresa activa");
  }
}
