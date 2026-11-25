import type { AprobarTomaFisica, GuardarConteoTomaFisica } from "@contable/shared";

export type { AprobarTomaFisica, GuardarConteoTomaFisica };

export interface DetalleTomaFisicaRegistro {
  productoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  controlaSeries: boolean;
  metodoValuacion: "promedio_ponderado" | "peps" | null;
  existenciaSistema: string;
  secuenciaSistema: string;
  cantidadContada: string | null;
  seriesContadas: string[] | null;
  cantidadFaltante: string | null;
  cantidadSobrante: string | null;
  valorFaltante: string | null;
  valorSobrante: string | null;
  valorFinal: string | null;
}

export interface TomaFisicaRegistro {
  id: string;
  empresaId: string;
  sucursalId: string;
  fecha: string;
  estado: "en_conteo" | "aprobada";
  partidaId: string | null;
  creadoEn: Date;
  aprobadoEn: Date | null;
  detalles: DetalleTomaFisicaRegistro[];
}

export interface CuentaTomaFisica {
  id: string;
  codigo: string;
  activa: boolean;
  imputable: boolean;
}

export interface LineaPartidaTomaFisica {
  cuentaId: string;
  debe: string;
  haber: string;
  concepto: string;
}

export interface ValorFinalTomaFisica {
  productoId: string;
  cantidadFaltante: string;
  cantidadSobrante: string;
  valorFaltante: string;
  valorSobrante: string;
  valorFinal: string;
}

export class TomaFisicaNoEncontradaError extends Error {
  constructor() {
    super("La toma física no existe en esta empresa.");
  }
}

export class TomaFisicaAbiertaError extends Error {
  constructor() {
    super("Ya hay una toma física en conteo para esta sucursal.");
  }
}

export class TomaFisicaSinPermisoError extends Error {
  constructor() {
    super("Tu rol no permite realizar esta acción de toma física.");
  }
}
