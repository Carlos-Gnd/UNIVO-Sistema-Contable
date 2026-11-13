import { createParamDecorator, UnauthorizedException, type ExecutionContext } from "@nestjs/common";

/** Usuario autenticado. El guard que verifica el JWT de Supabase (HU-05) lo coloca en request.user. */
export interface Usuario {
  id: string;
  /** Correo de la cuenta de Supabase, si el token lo trae */
  email?: string;
}

export interface SolicitudConUsuario {
  user?: Usuario;
}

/** Inyecta el usuario autenticado en un controlador; sin sesión responde 401. */
export const UsuarioActual = createParamDecorator((_dato: unknown, ctx: ExecutionContext): Usuario => {
  const usuario = ctx.switchToHttp().getRequest<SolicitudConUsuario>().user;
  if (!usuario?.id) throw new UnauthorizedException("Inicie sesión para continuar.");
  return usuario;
});
