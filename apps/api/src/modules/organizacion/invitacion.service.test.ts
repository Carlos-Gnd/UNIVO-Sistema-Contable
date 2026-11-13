import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvitacionService } from "./invitacion.service.js";

const mocks = vi.hoisted(() => {
  const queryRaw = vi.fn();
  const comoUsuario = vi.fn();
  const inviteUserByEmail = vi.fn();
  const deleteUser = vi.fn();
  const admin = { inviteUserByEmail, deleteUser };
  const auth = { admin };
  const client = { auth };
  const createClient = vi.fn(() => client);
  const usuarioFindFirst = vi.fn();
  const usuarioCreate = vi.fn();
  const usuario = { findFirst: usuarioFindFirst, create: usuarioCreate };
  const membresiaFindUnique = vi.fn();
  const membresiaCreate = vi.fn();
  const membresia = { findUnique: membresiaFindUnique, create: membresiaCreate };
  const rolFindUnique = vi.fn();
  const rol = { findUnique: rolFindUnique };
  const membresiaSucursalCreateMany = vi.fn();
  const membresiaSucursal = { createMany: membresiaSucursalCreateMany };
  const prisma = { $queryRaw: queryRaw, usuario };
  const tx = { $queryRaw: queryRaw, usuario, membresia, rol, membresiaSucursal };
  const baseDatos = { prisma };
  return {
    queryRaw,
    comoUsuario,
    inviteUserByEmail,
    deleteUser,
    createClient,
    usuarioFindFirst,
    usuarioCreate,
    membresiaFindUnique,
    membresiaCreate,
    rolFindUnique,
    membresiaSucursalCreateMany,
    prisma,
    tx,
    baseDatos,
  };
});

vi.mock("@contable/db", () => ({ comoUsuario: mocks.comoUsuario }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

describe("InvitacionService", () => {
  const envOriginal = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    WEB_URL: process.env.WEB_URL,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://ejemplo.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    process.env.WEB_URL = "https://contable.example/";
    mocks.queryRaw.mockResolvedValue([{ permitido: true, empresa_activa: true, cantidad: 1 }]);
    mocks.comoUsuario.mockImplementation(async (_prisma, _usuarioId, fn) => fn(mocks.tx));
    mocks.usuarioFindFirst.mockResolvedValue(null);
    mocks.usuarioCreate.mockResolvedValue({ id: "auth-user" });
    mocks.membresiaFindUnique.mockResolvedValue(null);
    mocks.membresiaCreate.mockResolvedValue({ id: "membresia-1" });
    mocks.rolFindUnique.mockResolvedValue({ id: 2 });
    mocks.membresiaSucursalCreateMany.mockResolvedValue({ count: 0 });
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "auth-user" } }, error: null });
    mocks.deleteUser.mockResolvedValue({ data: { user: { id: "auth-user" } }, error: null });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envOriginal)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("invita al correo y registra usuario, membresia y sucursales en una transaccion", async () => {
    const servicio = new InvitacionService(mocks.baseDatos as never);
    const datos = { correo: "persona@example.com", rol: "auxiliar" as const, sucursales: ["sucursal-1"] };

    await expect(servicio.invitar("empresa-1", "admin-1", datos)).resolves.toEqual({
      mensaje: "Invitación enviada y usuario agregado a la empresa.",
      invitacionEnviada: true,
    });

    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith("persona@example.com", {
      redirectTo: "https://contable.example/cambiar-contrasena",
    });
    expect(mocks.usuarioCreate).toHaveBeenCalledWith({
      data: { id: "auth-user", correo: "persona@example.com", nombre: "persona" },
    });
    expect(mocks.membresiaCreate).toHaveBeenCalledWith({
      data: { usuarioId: "auth-user", empresaId: "empresa-1", rolId: 2, todasSucursales: false },
      select: { id: true },
    });
    expect(mocks.membresiaSucursalCreateMany).toHaveBeenCalledWith({
      data: [{ membresiaId: "membresia-1", sucursalId: "sucursal-1" }],
    });
    expect(mocks.comoUsuario).toHaveBeenCalledWith(mocks.prisma, "admin-1", expect.any(Function));
  });

  it("agrega a la empresa un usuario existente sin reenviar la invitacion", async () => {
    mocks.usuarioFindFirst.mockResolvedValue({ id: "existing-user" });
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(
      servicio.invitar("empresa-1", "admin-1", {
        correo: "persona@example.com",
        rol: "contador",
        sucursales: [],
      }),
    ).resolves.toEqual({ mensaje: "Usuario agregado a la empresa.", invitacionEnviada: false });

    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.usuarioCreate).not.toHaveBeenCalled();
    expect(mocks.membresiaCreate).toHaveBeenCalledWith({
      data: { usuarioId: "existing-user", empresaId: "empresa-1", rolId: 2, todasSucursales: true },
      select: { id: true },
    });
  });

  it("responde conflicto si el usuario ya tiene membresia en esta empresa", async () => {
    mocks.usuarioFindFirst.mockResolvedValue({ id: "existing-user" });
    mocks.membresiaFindUnique.mockResolvedValue({ id: "membresia-existente" });
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(
      servicio.invitar("empresa-1", "admin-1", {
        correo: "persona@example.com",
        rol: "contador",
        sucursales: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rechaza a quien no tiene usuarios.gestionar sin llamar a Supabase", async () => {
    mocks.queryRaw.mockResolvedValue([{ permitido: false, empresa_activa: true }]);
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(
      servicio.invitar("empresa-1", "usuario-1", {
        correo: "persona@example.com",
        rol: "contador",
        sucursales: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("elimina la cuenta Auth si la transaccion de la membresia falla", async () => {
    mocks.membresiaCreate.mockRejectedValue(new Error("database error"));
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(
      servicio.invitar("empresa-1", "admin-1", {
        correo: "persona@example.com",
        rol: "contador",
        sucursales: [],
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-user");
  });

  it("rechaza sucursales ajenas a la empresa y revierte la invitacion Auth", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{ permitido: true, empresa_activa: true }]);
    mocks.queryRaw.mockResolvedValueOnce([{ permitido: true, empresa_activa: true }]);
    mocks.queryRaw.mockResolvedValueOnce([{ cantidad: 0 }]);
    const servicio = new InvitacionService(mocks.baseDatos as never);

    await expect(
      servicio.invitar("empresa-1", "admin-1", {
        correo: "persona@example.com",
        rol: "auxiliar",
        sucursales: ["sucursal-1"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-user");
  });
});
