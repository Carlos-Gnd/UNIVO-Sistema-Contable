import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { BaseDatos } from "./base-datos.js";
import { PUBLIC_ROUTE_KEY } from "../auth/public.decorator.js";
import { AUTORIZA_EN_CASO_DE_USO, PERMISO_REQUERIDO } from "./permiso.decorator.js";

interface SolicitudConPermiso {
  params?: Record<string, string | undefined>;
  user?: { id: string };
}

/** Autoriza los handlers marcados con @Permiso usando la matriz vigente de PostgreSQL. */
@Injectable()
export class PermisoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly baseDatos: BaseDatos,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permiso = this.reflector.getAllAndOverride<string>(PERMISO_REQUERIDO, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permiso) {
      const objetivos = [context.getHandler(), context.getClass()];
      const publica = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, objetivos);
      const enCasoDeUso = this.reflector.getAllAndOverride<string>(AUTORIZA_EN_CASO_DE_USO, objetivos);
      if (publica || enCasoDeUso) return true;
      // Negar por omisión: toda ruta debe declarar su política de acceso
      throw new ForbiddenException("Esta ruta no declara una política de acceso.");
    }

    const solicitud = context.switchToHttp().getRequest<SolicitudConPermiso>();
    const empresaId = solicitud.params?.empresaId;
    if (!empresaId) {
      throw new BadRequestException("Esta ruta requiere una empresa.");
    }

    const usuarioId = solicitud.user?.id;
    if (!usuarioId) throw new UnauthorizedException("Inicie sesión para continuar.");

    let filas: { permitido: boolean }[];
    try {
      filas = await this.baseDatos.prisma.$queryRaw<{ permitido: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM permisos_usuario pu
          JOIN empresas e ON e.id = pu.empresa_id AND e.activa
          JOIN usuarios u ON u.id = pu.usuario_id AND u.activo
          WHERE pu.usuario_id = ${usuarioId}::uuid
            AND pu.empresa_id = ${empresaId}::uuid
            AND pu.permiso = ${permiso}
        ) AS permitido`;
    } catch {
      throw new ServiceUnavailableException("No se pudo verificar el permiso del usuario.");
    }

    if (!filas[0]?.permitido) {
      throw new ForbiddenException(`Su rol no permite ${permiso} en esta empresa.`);
    }
    return true;
  }
}
