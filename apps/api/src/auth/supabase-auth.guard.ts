import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { User } from "@supabase/supabase-js";
import { PUBLIC_ROUTE_KEY } from "./public.decorator.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";

interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: User;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = typeof authorization === "string" ? /^Bearer\s+(\S+)$/i.exec(authorization.trim()) : null;

    const accessToken = match?.[1];

    if (!accessToken) {
      throw new UnauthorizedException("Se requiere un token Bearer de Supabase");
    }

    const user = await this.supabaseAuth.verificarToken(accessToken);

    if (!user) {
      throw new UnauthorizedException("El token de Supabase no es válido");
    }

    request.user = user;
    return true;
  }
}
