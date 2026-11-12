import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { Public } from "./public.decorator.js";
import { SupabaseAuthGuard } from "./supabase-auth.guard.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";

class ControladorDePrueba {
  @Public()
  rutaPublica(): void {}

  rutaProtegida(): void {}
}

const usuario = { id: "usuario-123" } as User;

function crearContexto(
  authorization: string | undefined,
  handler: () => void,
): { context: ExecutionContext; request: { headers: Record<string, string | undefined>; user?: User } } {
  const request: { headers: Record<string, string | undefined>; user?: User } = {
    headers: authorization ? { authorization } : {},
  };

  const context = {
    getClass: () => ControladorDePrueba,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

function crearGuard(verificarToken: (token: string) => Promise<User | null>) {
  const servicio = { verificarToken } as SupabaseAuthService;
  return new SupabaseAuthGuard(new Reflector(), servicio);
}

describe("SupabaseAuthGuard", () => {
  it("permite rutas públicas sin consultar Supabase", async () => {
    const verificarToken = vi.fn();
    const guard = crearGuard(verificarToken);
    const { context } = crearContexto(undefined, ControladorDePrueba.prototype.rutaPublica);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verificarToken).not.toHaveBeenCalled();
  });

  it("rechaza solicitudes sin token Bearer", async () => {
    const verificarToken = vi.fn();
    const guard = crearGuard(verificarToken);
    const { context } = crearContexto(undefined, ControladorDePrueba.prototype.rutaProtegida);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verificarToken).not.toHaveBeenCalled();
  });

  it("rechaza un token que Supabase no reconoce", async () => {
    const guard = crearGuard(vi.fn().mockResolvedValue(null));
    const { context } = crearContexto("Bearer token-invalido", ControladorDePrueba.prototype.rutaProtegida);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("valida el token y agrega el usuario autenticado a la solicitud", async () => {
    const verificarToken = vi.fn().mockResolvedValue(usuario);
    const guard = crearGuard(verificarToken);
    const { context, request } = crearContexto(
      "Bearer token-valido",
      ControladorDePrueba.prototype.rutaProtegida,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(verificarToken).toHaveBeenCalledWith("token-valido");
    expect(request.user).toBe(usuario);
  });
});
