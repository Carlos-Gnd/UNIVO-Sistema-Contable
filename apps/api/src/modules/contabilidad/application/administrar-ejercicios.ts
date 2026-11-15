import { ConflictException, Injectable } from "@nestjs/common";
import { comoUsuario } from "@contable/db";
import type { CrearEjercicio, EjercicioDetalle, EstadoPeriodo } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { exigirPermisoEmpresa } from "../../organizacion/application/acceso-organizacion.js";

function ejercicioDuplicado(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "P2002") return true;
  const mensaje = "message" in error && typeof error.message === "string" ? error.message : "";
  return /duplicate key|unique constraint|traslap|overlap/i.test(mensaje);
}

interface FilaEjercicio {
  id: string;
  anio: number;
  fechaInicio: Date;
  fechaFin: Date;
  estado: EstadoPeriodo;
  periodos: {
    id: string;
    mes: number;
    fechaInicio: Date;
    fechaFin: Date;
    estado: EstadoPeriodo;
    cerradoEn: Date | null;
    motivoReapertura: string | null;
  }[];
}

const fechaDate = (fecha: Date): string => fecha.toISOString().slice(0, 10);

function aDetalle(fila: FilaEjercicio): EjercicioDetalle {
  return {
    id: fila.id,
    anio: fila.anio,
    fechaInicio: fechaDate(fila.fechaInicio),
    fechaFin: fechaDate(fila.fechaFin),
    estado: fila.estado,
    periodos: fila.periodos.map((periodo) => ({
      id: periodo.id,
      mes: periodo.mes,
      fechaInicio: fechaDate(periodo.fechaInicio),
      fechaFin: fechaDate(periodo.fechaFin),
      estado: periodo.estado,
      cerradoEn: periodo.cerradoEn?.toISOString() ?? null,
      motivoReapertura: periodo.motivoReapertura,
    })),
  };
}

@Injectable()
export class AdministrarEjercicios {
  constructor(private readonly baseDatos: BaseDatos) {}

  async listar(usuarioId: string, empresaId: string): Promise<EjercicioDetalle[]> {
    await exigirPermisoEmpresa(
      this.baseDatos.prisma,
      empresaId,
      usuarioId,
      "partidas.ver",
      "No tiene permiso para consultar los ejercicios contables",
    );
    const ejercicios = await this.baseDatos.prisma.ejercicio.findMany({
      where: { empresaId },
      include: { periodos: { orderBy: { mes: "asc" } } },
      orderBy: { anio: "desc" },
    });
    return ejercicios.map((ejercicio) => aDetalle(ejercicio));
  }

  async crear(usuarioId: string, empresaId: string, datos: CrearEjercicio): Promise<EjercicioDetalle> {
    await exigirPermisoEmpresa(
      this.baseDatos.prisma,
      empresaId,
      usuarioId,
      "periodos.cerrar",
      "No tiene permiso para crear ejercicios contables",
    );
    try {
      const ejercicio = await comoUsuario(this.baseDatos.prisma, usuarioId, (tx) =>
        tx.ejercicio.create({
          data: {
            empresaId,
            anio: datos.anio,
            fechaInicio: new Date(`${datos.fechaInicio}T00:00:00.000Z`),
            fechaFin: new Date(`${datos.fechaFin}T00:00:00.000Z`),
          },
          include: { periodos: { orderBy: { mes: "asc" } } },
        }),
      );
      return aDetalle(ejercicio);
    } catch (error) {
      if (ejercicioDuplicado(error)) throw new ConflictException("Ya existe un ejercicio para ese año.");
      throw error;
    }
  }
}
