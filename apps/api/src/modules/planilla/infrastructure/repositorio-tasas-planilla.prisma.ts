import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { ConfiguracionPlanillaVista, CrearConfiguracionPlanilla } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  ConfiguracionPlanillaDuplicadaError,
  EmpresaTasasPlanillaNoEncontradaError,
  ReglaTasasPlanillaError,
  type RepositorioTasasPlanilla,
  type UnidadTasasPlanilla,
} from "../domain/tasas-planilla.js";

function aVista(fila: {
  id: string;
  vigenteDesde: Date;
  tasaIsssLaboral: { toFixed(decimales: number): string };
  tasaIsssPatronal: { toFixed(decimales: number): string };
  techoIsss: { toFixed(decimales: number): string };
  tasaAfpLaboral: { toFixed(decimales: number): string };
  tasaAfpPatronal: { toFixed(decimales: number): string };
  tramos: {
    desde: { toFixed(decimales: number): string };
    hasta: { toFixed(decimales: number): string } | null;
    porcentaje: { toFixed(decimales: number): string };
    cuotaFija: { toFixed(decimales: number): string };
  }[];
}): ConfiguracionPlanillaVista {
  return {
    id: fila.id,
    vigenteDesde: fila.vigenteDesde.toISOString().slice(0, 10),
    tasaIsssLaboral: fila.tasaIsssLaboral.toFixed(2),
    tasaIsssPatronal: fila.tasaIsssPatronal.toFixed(2),
    techoIsss: fila.techoIsss.toFixed(2),
    tasaAfpLaboral: fila.tasaAfpLaboral.toFixed(2),
    tasaAfpPatronal: fila.tasaAfpPatronal.toFixed(2),
    tramos: fila.tramos.map((tramo) => ({
      desde: tramo.desde.toFixed(2),
      hasta: tramo.hasta?.toFixed(2) ?? null,
      porcentaje: tramo.porcentaje.toFixed(2),
      cuotaFija: tramo.cuotaFija.toFixed(2),
    })),
  };
}

function esDuplicado(error: unknown): boolean {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return false;
  return JSON.stringify((error as { meta?: unknown }).meta ?? {}).includes(
    "configuraciones_planilla_empresa_id_vigente_desde",
  );
}

class UnidadPrismaTasasPlanilla implements UnidadTasasPlanilla {
  constructor(private readonly tx: Tx) {}

  private async verificarMembresia(usuarioId: string, empresaId: string): Promise<void> {
    const membresia = await this.tx.membresia.findFirst({
      where: { usuarioId, empresaId, activa: true },
      select: { id: true },
    });
    if (!membresia) throw new EmpresaTasasPlanillaNoEncontradaError();
  }

  async configuraciones(usuarioId: string, empresaId: string): Promise<ConfiguracionPlanillaVista[]> {
    await this.verificarMembresia(usuarioId, empresaId);
    const filas = await this.tx.configuracionPlanilla.findMany({
      where: { empresaId },
      include: { tramos: { orderBy: { orden: "asc" } } },
      orderBy: { vigenteDesde: "desc" },
    });
    return filas.map(aVista);
  }

  async crear(
    usuarioId: string,
    empresaId: string,
    datos: CrearConfiguracionPlanilla,
  ): Promise<ConfiguracionPlanillaVista> {
    await this.verificarMembresia(usuarioId, empresaId);
    try {
      const fila = await this.tx.configuracionPlanilla.create({
        data: {
          empresaId,
          vigenteDesde: new Date(`${datos.vigenteDesde}T00:00:00.000Z`),
          tasaIsssLaboral: datos.tasaIsssLaboral,
          tasaIsssPatronal: datos.tasaIsssPatronal,
          techoIsss: datos.techoIsss,
          tasaAfpLaboral: datos.tasaAfpLaboral,
          tasaAfpPatronal: datos.tasaAfpPatronal,
          tramos: {
            create: datos.tramos.map((tramo, indice) => ({
              orden: indice + 1,
              desde: tramo.desde,
              hasta: tramo.hasta,
              porcentaje: tramo.porcentaje,
              cuotaFija: tramo.cuotaFija,
            })),
          },
        },
        include: { tramos: { orderBy: { orden: "asc" } } },
      });
      return aVista(fila);
    } catch (error) {
      if (esDuplicado(error)) throw new ConfiguracionPlanillaDuplicadaError();
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaTasasPlanillaError(regla);
      throw error;
    }
  }
}

@Injectable()
export class RepositorioTasasPlanillaPrisma implements RepositorioTasasPlanilla {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadTasasPlanilla) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrismaTasasPlanilla(tx)));
  }
}
