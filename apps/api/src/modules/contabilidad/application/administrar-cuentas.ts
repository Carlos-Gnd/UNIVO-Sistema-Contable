import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { comoUsuario, type PrismaClient } from "@contable/db";
import type { CrearCuenta, EditarCuenta } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import { exigirPermisoEmpresa } from "../../organizacion/application/acceso-organizacion.js";

type Cuenta = Awaited<ReturnType<PrismaClient["cuenta"]["findUniqueOrThrow"]>>;

function cuentaDuplicada(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function lanzarErrorDeCuenta(error: unknown): never {
  if (cuentaDuplicada(error)) throw new ConflictException("Ya existe una cuenta con ese código.");
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

@Injectable()
export class AdministrarCuentas {
  constructor(private readonly baseDatos: BaseDatos) {}

  async listar(usuarioId: string, empresaId: string): Promise<Cuenta[]> {
    await exigirPermisoEmpresa(
      this.baseDatos.prisma,
      empresaId,
      usuarioId,
      "catalogo.ver",
      "No tiene permiso para consultar el catálogo de cuentas",
    );
    return this.baseDatos.prisma.cuenta.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
  }

  async crear(usuarioId: string, empresaId: string, datos: CrearCuenta): Promise<Cuenta> {
    await exigirPermisoEmpresa(
      this.baseDatos.prisma,
      empresaId,
      usuarioId,
      "catalogo.editar",
      "No tiene permiso para crear cuentas",
    );
    try {
      return await comoUsuario(this.baseDatos.prisma, usuarioId, (tx) =>
        tx.cuenta.create({ data: { ...datos, empresaId } }),
      );
    } catch (error) {
      lanzarErrorDeCuenta(error);
    }
  }

  async editar(
    usuarioId: string,
    empresaId: string,
    cuentaId: string,
    cambios: EditarCuenta,
  ): Promise<Cuenta> {
    if (cambios.activa !== undefined) {
      await exigirPermisoEmpresa(
        this.baseDatos.prisma,
        empresaId,
        usuarioId,
        "catalogo.inactivar",
        "No tiene permiso para cambiar el estado de cuentas",
      );
    }
    if (Object.keys(cambios).some((campo) => campo !== "activa")) {
      await exigirPermisoEmpresa(
        this.baseDatos.prisma,
        empresaId,
        usuarioId,
        "catalogo.editar",
        "No tiene permiso para editar cuentas",
      );
    }
    try {
      return await comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
        const actual = await tx.cuenta.findFirst({ where: { id: cuentaId, empresaId } });
        if (!actual) throw new NotFoundException("No se encontró la cuenta en esta empresa.");
        return tx.cuenta.update({ where: { id: cuentaId }, data: cambios });
      });
    } catch (error) {
      lanzarErrorDeCuenta(error);
    }
  }
}
