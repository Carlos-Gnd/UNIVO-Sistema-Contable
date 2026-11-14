import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { BaseDatos } from "./base-datos.js";
import { PUBLIC_ROUTE_KEY } from "../auth/public.decorator.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SolicitudConEmpresa {
  params?: Record<string, string | undefined>;
  user?: { id: string };
}

/** Valida que el usuario tenga acceso a la empresa de las rutas /empresas/:empresaId. */
@Injectable()
export class EmpresaActivaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly baseDatos: BaseDatos,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublica) return true;

    const solicitud = context.switchToHttp().getRequest<SolicitudConEmpresa>();
    const empresaId = solicitud.params?.empresaId;
    // Rutas globales como /health y POST /empresas no operan dentro de una empresa existente.
    if (!empresaId) return true;
    if (!UUID.test(empresaId)) throw new BadRequestException("El identificador de empresa no es válido.");

    const usuarioId = solicitud.user?.id;
    if (!usuarioId) throw new UnauthorizedException("Inicie sesión para continuar.");

    let acceso: { permitido: boolean }[];
    try {
      acceso = await this.baseDatos.prisma.$queryRaw<{ permitido: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM empresas e
          JOIN membresias m ON m.empresa_id = e.id AND m.activa
          JOIN usuarios u ON u.id = m.usuario_id AND u.activo
          WHERE e.id = ${empresaId}::uuid
            AND e.activa
            AND m.usuario_id = ${usuarioId}::uuid
        ) AS permitido`;
    } catch {
      throw new ServiceUnavailableException("No se pudo validar la empresa activa.");
    }

    if (!acceso[0]?.permitido) {
      throw new NotFoundException("La empresa no existe o el usuario no tiene acceso.");
    }

    return true;
  }
}
