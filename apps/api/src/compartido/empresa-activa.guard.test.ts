import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmpresaActivaGuard } from "./empresa-activa.guard.js";

const EMPRESA = "a1111111-1111-4111-8111-111111111111";
const USUARIO = "b2222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("./base-datos.js", () => ({ BaseDatos: class {} }));

function contexto(solicitud: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => solicitud }),
  } as unknown as ExecutionContext;
}

describe("EmpresaActivaGuard", () => {
  const guard = new EmpresaActivaGuard(new Reflector(), {
    prisma: { $queryRaw: mocks.queryRaw },
  } as never);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([{ permitido: true }]);
  });

  it("deja pasar rutas que no están dentro de una empresa", async () => {
    await expect(guard.canActivate(contexto({ params: {}, user: { id: USUARIO } }))).resolves.toBe(true);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("rechaza un identificador de empresa inválido antes de consultar la base", async () => {
    await expect(
      guard.canActivate(contexto({ params: { empresaId: "no-es-uuid" }, user: { id: USUARIO } })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("requiere el usuario autenticado", async () => {
    await expect(guard.canActivate(contexto({ params: { empresaId: EMPRESA } }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("acepta una membresía activa y adjunta la empresa a la solicitud", async () => {
    const solicitud = { params: { empresaId: EMPRESA }, user: { id: USUARIO } };
    await expect(guard.canActivate(contexto(solicitud))).resolves.toBe(true);
    expect(solicitud).toHaveProperty("empresaActiva", { id: EMPRESA });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });

  it("oculta empresas inactivas o sin membresía activa", async () => {
    mocks.queryRaw.mockResolvedValue([{ permitido: false }]);
    await expect(
      guard.canActivate(contexto({ params: { empresaId: EMPRESA }, user: { id: USUARIO } })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("responde 503 si no puede consultar la empresa activa", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("database unavailable"));
    await expect(
      guard.canActivate(contexto({ params: { empresaId: EMPRESA }, user: { id: USUARIO } })),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
