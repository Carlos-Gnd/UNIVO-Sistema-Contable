import type {
  ConfiguracionIsrVista,
  CrearConfiguracionIsr,
  EstadoCierreAnual,
  PartidaAnualVista,
  ResultadoProvisionIsr,
} from "@contable/shared";

export interface AccesoCierreAnual {
  permisos: ReadonlySet<string>;
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export class EmpresaCierreAnualNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o el usuario no tiene acceso a ella.");
  }
}

export class SinPermisoCierreAnualError extends Error {}
export class AlcanceCierreAnualIncompletoError extends Error {}
export class EjercicioCierreAnualNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el ejercicio contable indicado.");
  }
}

export class EjercicioSiguienteNoEncontradoError extends Error {
  constructor() {
    super("Cree el ejercicio siguiente antes de generar la partida de reapertura.");
  }
}

export class ConfiguracionIsrNoEncontradaError extends Error {
  constructor() {
    super("Configure el ISR del ejercicio antes de calcularlo.");
  }
}

export class ConflictoCierreAnualError extends Error {}
export class ReglaCierreAnualError extends Error {}

export interface UnidadCierreAnual {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoCierreAnual | null>;
  estado(empresaId: string, anio: number, acceso: AccesoCierreAnual): Promise<EstadoCierreAnual>;
  crearConfiguracion(
    usuarioId: string,
    empresaId: string,
    datos: CrearConfiguracionIsr,
  ): Promise<ConfiguracionIsrVista>;
  calcularYProvisionar(usuarioId: string, empresaId: string, anio: number): Promise<ResultadoProvisionIsr>;
  cerrarNoviembre(empresaId: string, anio: number, acceso: AccesoCierreAnual): Promise<void>;
  crearPartidaCierre(empresaId: string, anio: number, acceso: AccesoCierreAnual): Promise<PartidaAnualVista>;
  confirmarCierre(empresaId: string, anio: number, acceso: AccesoCierreAnual): Promise<void>;
  crearPartidaReapertura(
    empresaId: string,
    anio: number,
    acceso: AccesoCierreAnual,
  ): Promise<PartidaAnualVista>;
}

export interface RepositorioCierreAnual {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadCierreAnual) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_CIERRE_ANUAL = Symbol("REPOSITORIO_CIERRE_ANUAL");
