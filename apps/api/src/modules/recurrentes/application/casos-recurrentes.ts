import { Inject, Injectable } from "@nestjs/common";
import type {
  CrearPlantillaRecurrente,
  EditarPlantillaRecurrente,
  GenerarPartidaRecurrente,
  PartidaGeneradaVista,
  PlantillaRecurrenteVista,
} from "@contable/shared";
import {
  RecurrenteEmpresaNoEncontradaError,
  REPOSITORIO_RECURRENTES,
  type AccesoRecurrentes,
  type RepositorioRecurrentes,
  type UnidadRecurrentes,
} from "../domain/recurrentes.js";

async function accesoDe(unidad: UnidadRecurrentes, usuarioId: string, empresaId: string) {
  const acceso: AccesoRecurrentes | null = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new RecurrenteEmpresaNoEncontradaError();
  return acceso;
}

/** Plantillas de partidas recurrentes y generación del borrador del mes (HU-26, S3-T04). */
@Injectable()
export class CasosRecurrentes {
  constructor(@Inject(REPOSITORIO_RECURRENTES) private readonly repositorio: RepositorioRecurrentes) {}

  listar(usuarioId: string, empresaId: string): Promise<PlantillaRecurrenteVista[]> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) =>
      unidad.listar(empresaId, await accesoDe(unidad, usuarioId, empresaId)),
    );
  }

  crearDesdePartida(
    usuarioId: string,
    empresaId: string,
    datos: CrearPlantillaRecurrente,
  ): Promise<PlantillaRecurrenteVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) =>
      unidad.crearDesdePartida(usuarioId, empresaId, datos, await accesoDe(unidad, usuarioId, empresaId)),
    );
  }

  editar(
    usuarioId: string,
    empresaId: string,
    plantillaId: string,
    datos: EditarPlantillaRecurrente,
  ): Promise<PlantillaRecurrenteVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) =>
      unidad.editar(empresaId, plantillaId, datos, await accesoDe(unidad, usuarioId, empresaId)),
    );
  }

  generar(
    usuarioId: string,
    empresaId: string,
    plantillaId: string,
    datos: GenerarPartidaRecurrente,
  ): Promise<PartidaGeneradaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) =>
      unidad.generar(usuarioId, empresaId, plantillaId, datos, await accesoDe(unidad, usuarioId, empresaId)),
    );
  }
}
