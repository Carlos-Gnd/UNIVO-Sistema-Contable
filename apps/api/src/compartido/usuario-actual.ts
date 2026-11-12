import { createParamDecorator, UnauthorizedException, type ExecutionContext } from "@nestjs/common";

/** Usuario autenticado. Lo coloca en la solicitud el guard que verifica el JWT de Supabase (HU-05). */
export interface Usuario {
  id: string;
}

export interface SolicitudConUsuario {
  usuario?: Usuario;
}

/** Inyecta el usuario autenticado en un controlador; sin sesión responde 401. */
export const UsuarioActual = createParamDecorator((_dato: unknown, ctx: ExecutionContext): Usuario => {
  const usuario = ctx.switchToHttp().getRequest<SolicitudConUsuario>().usuario;
  if (!usuario?.id) throw new UnauthorizedException("Inicie sesión para continuar.");
  return usuario;
});
