import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AsignacionUsuarioService } from "./asignacion-usuario.service.js";

const mocks = vi.hoisted(() => {
  const queryRaw = vi.fn();
  const comoUsuario = vi.fn();
  const membresiaFindUnique = vi.fn();
  const membresiaUpdate = vi.fn();
  const rolFindUnique = vi.fn();
  const sucursalesDeleteMany = vi.fn();
  const sucursalesCreateMany = vi.fn();
  const prisma = { $queryRaw: queryRaw };
  const tx = {
    $queryRaw: queryRaw,
    membresia: { findUnique: membresiaFindUnique, update: membresiaUpdate },
    rol: { findUnique: rolFindUnique },
    membresiaSucursal: { deleteMany: sucursalesDeleteMany, createMany: sucursalesCreateMany },
  };
  return {
    queryRaw,
    comoUsuario,
    membresiaFindUnique,
    membresiaUpdate,
    rolFindUnique,
    sucursalesDeleteMany,
    sucursalesCreateMany,
    prisma,
    tx,
    baseDatos: { prisma },
  };
});

vi.mock("@contable/db", () => ({ comoUsuario: mocks.comoUsuario }));

describe("AsignacionUsuarioService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([{ permitido: true, empresa_activa: true, cantidad: 1 }]);
    mocks.comoUsuario.mockImplementation(async (_prisma, _usuarioId, fn) => fn(mocks.tx));
    mocks.membresiaFindUnique.mockResolvedValue({ id: "membresia-1", activa: true });
    mocks.membresiaUpdate.mockResolvedValue({ id: "membresia-1" });
    mocks.rolFindUnique.mockResolvedValue({ id: 3 });
    mocks.sucursalesDeleteMany.mockResolvedValue({ count: 0 });
    mocks.sucursalesCreateMany.mockResolvedValue({ count: 1 });
  });

  it("actualiza rol y reemplaza sucursales dentro de una transacción auditada", async () => {
    const servicio = new AsignacionUsuarioService(mocks.baseDatos as never);

    await expect(
      servicio.asignar("empresa-1", "miembro-1", "admin-1", {
        rol: "auxiliar",
        sucursales: ["sucursal-1"],
      }),
    ).resolves.toEqual({ mensaje: "Rol y sucursales del usuario actualizados." });

    expect(mocks.comoUsuario).toHaveBeenCalledWith(mocks.prisma, "admin-1", expect.any(Function));
    expect(mocks.membresiaFindUnique).toHaveBeenCalledWith({
      where: { usuarioId_empresaId: { usuarioId: "miembro-1", empresaId: "empresa-1" } },
      select: { id: true, activa: true },
    });
    expect(mocks.membresiaUpdate).toHaveBeenCalledWith({
      where: { id: "membresia-1" },
      data: { rolId: 3, todasSucursales: false },
    });
    expect(mocks.sucursalesDeleteMany).toHaveBeenCalledWith({ where: { membresiaId: "membresia-1" } });
    expect(mocks.sucursalesCreateMany).toHaveBeenCalledWith({
      data: [{ membresiaId: "membresia-1", sucursalId: "sucursal-1" }],
    });
  });

  it("rechaza usuarios sin permiso para gestionar membresías", async () => {
    mocks.queryRaw.mockResolvedValue([{ permitido: false, empresa_activa: true }]);
    const servicio = new AsignacionUsuarioService(mocks.baseDatos as never);

    await expect(
      servicio.asignar("empresa-1", "miembro-1", "usuario-1", { rol: "contador", sucursales: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.comoUsuario).not.toHaveBeenCalled();
  });

  it("rechaza membresías inexistentes o inactivas", async () => {
    mocks.membresiaFindUnique.mockResolvedValue(null);
    const servicio = new AsignacionUsuarioService(mocks.baseDatos as never);

    await expect(
      servicio.asignar("empresa-1", "miembro-1", "admin-1", { rol: "contador", sucursales: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rechaza sucursales que no están activas en la empresa", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{ permitido: true, empresa_activa: true }]);
    mocks.queryRaw.mockResolvedValueOnce([{ permitido: true, empresa_activa: true }]);
    mocks.queryRaw.mockResolvedValueOnce([{ cantidad: 0 }]);
    const servicio = new AsignacionUsuarioService(mocks.baseDatos as never);

    await expect(
      servicio.asignar("empresa-1", "miembro-1", "admin-1", {
        rol: "auxiliar",
        sucursales: ["sucursal-ajena"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.membresiaUpdate).not.toHaveBeenCalled();
  });
});
