import type {
  CrearPlantillaRecurrente,
  EditarPlantillaRecurrente,
  GenerarPartidaRecurrente,
  PartidaGeneradaVista,
  PlantillaRecurrenteVista,
} from "@contable/shared";

export class RecurrenteEmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}
export class PartidaRecurrenteNoEncontradaError extends Error {
  constructor() {
    super("La partida no existe en esta empresa.");
  }
}
export class PlantillaRecurrenteNoEncontradaError extends Error {
  constructor() {
    super("La plantilla recurrente no existe en esta empresa.");
  }
}
export class SucursalRecurrenteNoAutorizadaError extends Error {
  constructor() {
    super("No tiene acceso a la sucursal de la plantilla.");
  }
}
export class NombrePlantillaDuplicadoError extends Error {
  constructor() {
    super("Ya existe una plantilla con ese nombre.");
  }
}
export class ReglaRecurrenteError extends Error {}
export class PartidaDelMesYaGeneradaError extends Error {
  constructor() {
    super("La plantilla ya generó una partida vigente en ese mes.");
  }
}

export interface AccesoRecurrentes {
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export interface UnidadRecurrentes {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoRecurrentes | null>;
  listar(empresaId: string, acceso: AccesoRecurrentes): Promise<PlantillaRecurrenteVista[]>;
  crearDesdePartida(
    usuarioId: string,
    empresaId: string,
    datos: CrearPlantillaRecurrente,
    acceso: AccesoRecurrentes,
  ): Promise<PlantillaRecurrenteVista>;
  editar(
    empresaId: string,
    plantillaId: string,
    datos: EditarPlantillaRecurrente,
    acceso: AccesoRecurrentes,
  ): Promise<PlantillaRecurrenteVista>;
  generar(
    usuarioId: string,
    empresaId: string,
    plantillaId: string,
    datos: GenerarPartidaRecurrente,
    acceso: AccesoRecurrentes,
  ): Promise<PartidaGeneradaVista>;
}

export interface RepositorioRecurrentes {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadRecurrentes) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_RECURRENTES = Symbol("RepositorioRecurrentes");
