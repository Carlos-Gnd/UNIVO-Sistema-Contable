import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvitacionService } from "./invitacion.service.js";

const mocks = vi.hoisted(() => {
  const queryRaw = vi.fn();
  const comoUsuario = vi.fn();
  const inviteUserByEmail = vi.fn();
  const admin = { inviteUserByEmail };
  const auth = { admin };
  const client = { auth };
  const createClient = vi.fn(() => client);
  const prisma = { $queryRaw: queryRaw };
  const tx = { $queryRaw: queryRaw };
  const baseDatos = { prisma };
  return { queryRaw, comoUsuario, inviteUserByEmail, createClient, prisma, tx, baseDatos };
});

vi.mock("@contable/db", () => ({ comoUsuario: mocks.comoUsuario }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

describe("InvitacionService", () => {
  const envOriginal = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://ejemplo.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    mocks.queryRaw.mockResolvedValue([{ permitido: true, empresa_activa: true }]);
    mocks.comoUsuario.mockImplementation(async (_prisma, _usuarioId, fn) => fn(mocks.tx));
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "auth-user" } }, error: null });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envOriginal)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("autoriza por empresa y envía la invitación a Supabase Auth", async () => {
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(servicio.invitar("empresa-1", "usuario-1", "persona@example.com")).resolves.toEqual({
      mensaje: "Invitacion enviada al correo indicado.",
    });

    expect(mocks.comoUsuario).toHaveBeenCalledWith(mocks.prisma, "usuario-1", expect.any(Function));
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith("persona@example.com");
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://ejemplo.supabase.co",
      "sb_secret_test",
      expect.any(Object),
    );
  });

  it("rechaza a quien no tiene usuarios.gestionar sin llamar a Supabase", async () => {
    mocks.queryRaw.mockResolvedValue([{ permitido: false, empresa_activa: true }]);
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(servicio.invitar("empresa-1", "usuario-1", "persona@example.com")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("rechaza empresas inexistentes o inactivas", async () => {
    mocks.queryRaw.mockResolvedValue([{ permitido: true, empresa_activa: false }]);
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(servicio.invitar("empresa-1", "usuario-1", "persona@example.com")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("responde conflicto si Supabase indica que el correo ya tiene una cuenta o invitación", async () => {
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { status: 422 } });
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(servicio.invitar("empresa-1", "usuario-1", "persona@example.com")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("responde 503 si la clave secreta de Supabase no está configurada", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(servicio.invitar("empresa-1", "usuario-1", "persona@example.com")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
