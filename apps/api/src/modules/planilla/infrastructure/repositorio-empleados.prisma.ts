import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { CrearEmpleado, EditarEmpleado, EmpleadoVista } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  EmpleadoDuplicadoError,
  EmpleadoNoEncontradoError,
  EmpresaPlanillaNoEncontradaError,
  ReglaEmpleadoError,
  SucursalEmpleadoNoAutorizadaError,
  SucursalEmpleadoNoEncontradaError,
  type AccesoPlanilla,
  type FiltroEmpleados,
  type RepositorioEmpleados,
  type UnidadEmpleados,
} from "../domain/empleado.js";

interface EmpleadoFila {
  id: string;
  sucursalId: string;
  nombres: string;
  apellidos: string;
  dui: string;
  nit: string;
  numeroIsss: string;
  nup: string;
  puesto: string;
  area: string | null;
  salario: { toFixed(decimales: number): string };
  fechaIngreso: Date;
  activo: boolean;
  sucursal: { nombre: string };
}

const aVista = (e: EmpleadoFila): EmpleadoVista => ({
  id: e.id,
  sucursalId: e.sucursalId,
  sucursal: e.sucursal.nombre,
  nombres: e.nombres,
  apellidos: e.apellidos,
  dui: e.dui,
  nit: e.nit,
  numeroIsss: e.numeroIsss,
  nup: e.nup,
  puesto: e.puesto,
  area: e.area,
  salario: e.salario.toFixed(2),
  fechaIngreso: e.fechaIngreso.toISOString().slice(0, 10),
  activo: e.activo,
});

function esDuplicado(error: unknown): boolean {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return false;
  const meta = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  return [
    "empleados_empresa_id_dui",
    "empleados_empresa_id_nit",
    "empleados_empresa_id_numero_isss",
    "empleados_empresa_id_nup",
  ].some((indice) => meta.includes(indice));
}

class UnidadPrismaEmpleados implements UnidadEmpleados {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoPlanilla | null> {
    const membresia = await this.tx.membresia.findFirst({
      where: { usuarioId, empresaId, activa: true },
      select: { todasSucursales: true, sucursales: { select: { sucursalId: true } } },
    });
    return membresia
      ? {
          todasSucursales: membresia.todasSucursales,
          sucursales: membresia.sucursales.map((s) => s.sucursalId),
        }
      : null;
  }

  private async accesoRequerido(usuarioId: string, empresaId: string): Promise<AccesoPlanilla> {
    const acceso = await this.acceso(usuarioId, empresaId);
    if (!acceso) throw new EmpresaPlanillaNoEncontradaError();
    return acceso;
  }

  private async validarSucursal(
    empresaId: string,
    sucursalId: string,
    acceso: AccesoPlanilla,
  ): Promise<void> {
    const sucursal = await this.tx.sucursal.findFirst({
      where: { id: sucursalId, empresaId, activa: true },
      select: { id: true },
    });
    if (!sucursal) throw new SucursalEmpleadoNoEncontradaError();
    if (!acceso.todasSucursales && !acceso.sucursales.includes(sucursalId)) {
      throw new SucursalEmpleadoNoAutorizadaError();
    }
  }

  private filtroSucursales(acceso: AccesoPlanilla): { sucursalId?: { in: string[] } } {
    return acceso.todasSucursales ? {} : { sucursalId: { in: [...acceso.sucursales] } };
  }

  async empleados(usuarioId: string, empresaId: string, filtro: FiltroEmpleados): Promise<EmpleadoVista[]> {
    const acceso = await this.accesoRequerido(usuarioId, empresaId);
    const filas = await this.tx.empleado.findMany({
      where: {
        empresaId,
        ...this.filtroSucursales(acceso),
        ...(filtro.activo !== undefined ? { activo: filtro.activo } : {}),
      },
      include: { sucursal: { select: { nombre: true } } },
      orderBy: [{ activo: "desc" }, { puesto: "asc" }, { dui: "asc" }],
    });
    return filas.map(aVista);
  }

  async empleado(usuarioId: string, empresaId: string, empleadoId: string): Promise<EmpleadoVista> {
    const acceso = await this.accesoRequerido(usuarioId, empresaId);
    const fila = await this.tx.empleado.findFirst({
      where: { id: empleadoId, empresaId, ...this.filtroSucursales(acceso) },
      include: { sucursal: { select: { nombre: true } } },
    });
    if (!fila) throw new EmpleadoNoEncontradoError();
    return aVista(fila);
  }

  async crearEmpleado(usuarioId: string, empresaId: string, datos: CrearEmpleado): Promise<EmpleadoVista> {
    const acceso = await this.accesoRequerido(usuarioId, empresaId);
    await this.validarSucursal(empresaId, datos.sucursalId, acceso);
    try {
      const fila = await this.tx.empleado.create({
        data: {
          empresaId,
          sucursalId: datos.sucursalId,
          nombres: datos.nombres,
          apellidos: datos.apellidos,
          dui: datos.dui,
          nit: datos.nit,
          numeroIsss: datos.numeroIsss,
          nup: datos.nup,
          puesto: datos.puesto,
          area: datos.area ?? null,
          salario: datos.salario,
          fechaIngreso: new Date(`${datos.fechaIngreso}T00:00:00.000Z`),
        },
        include: { sucursal: { select: { nombre: true } } },
      });
      return aVista(fila);
    } catch (error) {
      if (esDuplicado(error)) throw new EmpleadoDuplicadoError();
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaEmpleadoError(regla);
      throw error;
    }
  }

  async editarEmpleado(
    usuarioId: string,
    empresaId: string,
    empleadoId: string,
    cambios: EditarEmpleado,
  ): Promise<EmpleadoVista> {
    const acceso = await this.accesoRequerido(usuarioId, empresaId);
    const actual = await this.tx.empleado.findFirst({
      where: { id: empleadoId, empresaId, ...this.filtroSucursales(acceso) },
      select: { id: true, sucursalId: true },
    });
    if (!actual) throw new EmpleadoNoEncontradoError();
    if (cambios.sucursalId !== undefined) {
      await this.validarSucursal(empresaId, cambios.sucursalId, acceso);
    }
    try {
      const fila = await this.tx.empleado.update({
        where: { id: empleadoId },
        data: {
          ...(cambios.nombres !== undefined ? { nombres: cambios.nombres } : {}),
          ...(cambios.apellidos !== undefined ? { apellidos: cambios.apellidos } : {}),
          ...(cambios.dui !== undefined ? { dui: cambios.dui } : {}),
          ...(cambios.nit !== undefined ? { nit: cambios.nit } : {}),
          ...(cambios.numeroIsss !== undefined ? { numeroIsss: cambios.numeroIsss } : {}),
          ...(cambios.nup !== undefined ? { nup: cambios.nup } : {}),
          ...(cambios.puesto !== undefined ? { puesto: cambios.puesto } : {}),
          ...(cambios.area !== undefined ? { area: cambios.area } : {}),
          ...(cambios.salario !== undefined ? { salario: cambios.salario } : {}),
          ...(cambios.fechaIngreso !== undefined
            ? { fechaIngreso: new Date(`${cambios.fechaIngreso}T00:00:00.000Z`) }
            : {}),
          ...(cambios.sucursalId !== undefined ? { sucursalId: cambios.sucursalId } : {}),
          ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
        },
        include: { sucursal: { select: { nombre: true } } },
      });
      return aVista(fila);
    } catch (error) {
      if (esDuplicado(error)) throw new EmpleadoDuplicadoError();
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaEmpleadoError(regla);
      throw error;
    }
  }
}

@Injectable()
export class RepositorioEmpleadosPrisma implements RepositorioEmpleados {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadEmpleados) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrismaEmpleados(tx)));
  }
}
