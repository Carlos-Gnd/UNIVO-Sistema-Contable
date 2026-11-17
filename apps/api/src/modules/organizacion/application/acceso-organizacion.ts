import { ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { PrismaClient } from "@contable/db";

type ConsultasOrganizacion = Pick<PrismaClient, "$queryRaw">;

/** Comprueba en un solo lugar el permiso solicitado y que la empresa siga activa. */
export async function exigirPermisoEmpresa(
  consultas: ConsultasOrganizacion,
  empresaId: string,
  usuarioId: string,
  permiso: string,
  mensajePermiso: string,
): Promise<void> {
  let filas: { permitido: boolean; empresa_activa: boolean }[];
  try {
    filas = await consultas.$queryRaw<{ permitido: boolean; empresa_activa: boolean }[]>`
      SELECT
        EXISTS (
          SELECT 1 FROM permisos_usuario
          WHERE usuario_id = ${usuarioId}::uuid
            AND empresa_id = ${empresaId}::uuid
            AND permiso = ${permiso}
        ) AS permitido,
        EXISTS (SELECT 1 FROM empresas WHERE id = ${empresaId}::uuid AND activa) AS empresa_activa`;
  } catch {
    throw new ServiceUnavailableException("No se pudo verificar el acceso a la empresa");
  }
  if (!filas[0]?.permitido) throw new ForbiddenException(mensajePermiso);
  if (!filas[0]?.empresa_activa) throw new NotFoundException("No se encontró una empresa activa");
}
