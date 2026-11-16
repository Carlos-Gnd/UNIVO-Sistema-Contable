import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermisoGuard } from "./permiso.guard.js";

const EMPRESA = "a1111111-1111-4111-8111-111111111111";
const USUARIO = "b2222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn(), permiso: vi.fn() }));

vi.mock("./base-datos.js", () => ({ BaseDatos: class {} }));

function contexto(solicitud: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => solicitud }),
  } as unknown as ExecutionContext;
}

describe("PermisoGuard", () => {
  const guard = new PermisoGuard(
    { getAllAndOverride: mocks.permiso } as never,
    { prisma: { $queryRaw: mocks.queryRaw } } as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permiso.mockReturnValue("catalogo.ver");
    mocks.queryRaw.mockResolvedValue([{ permitido: true }]);
  });

  it("deja pasar rutas sin @Permiso y no consulta la base", async () => {
    mocks.permiso.mockReturnValue(undefined);
    await expect(guard.canActivate(contexto({ params: {}, user: { id: USUARIO } }))).resolves.toBe(true);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("responde 400 si la ruta protegida no contiene empresaId", async () => {
    await expect(guard.canActivate(contexto({ params: {}, user: { id: USUARIO } }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("responde 401 si la solicitud no tiene usuario autenticado", async () => {
    await expect(guard.canActivate(contexto({ params: { empresaId: EMPRESA } }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("deja pasar cuando el usuario tiene el permiso requerido", async () => {
    await expect(
      guard.canActivate(contexto({ params: { empresaId: EMPRESA }, user: { id: USUARIO } })),
    ).resolves.toBe(true);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });

  it("responde 403 con el permiso requerido cuando la matriz lo deniega", async () => {
    mocks.queryRaw.mockResolvedValue([{ permitido: false }]);
    await expect(
      guard.canActivate(contexto({ params: { empresaId: EMPRESA }, user: { id: USUARIO } })),
    ).rejects.toThrow(new ForbiddenException("Su rol no permite catalogo.ver en esta empresa."));
  });

  it("responde 503 si falla la consulta de permisos", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("database unavailable"));
    await expect(
      guard.canActivate(contexto({ params: { empresaId: EMPRESA }, user: { id: USUARIO } })),
    ).rejects.toThrow(new ServiceUnavailableException("No se pudo verificar el permiso del usuario."));
  });
});
