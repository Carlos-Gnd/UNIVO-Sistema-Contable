import type { CrearPartidaEntrada, TipoPartida } from "@contable/shared";
import { montoParaApi, nuevaClave, pulirMonto, type FilaPartida } from "./lineas";
import type { PartidaVista } from "./tipos";

export interface CabeceraPartida {
  fecha: string;
  tipo: TipoPartida;
  sucursalId: string;
  documentoTipo: string;
  documentoNumero: string;
  concepto: string;
}

export interface ValoresIniciales {
  cabecera: CabeceraPartida;
  filas: FilaPartida[];
}

/** Valores del formulario a partir de una partida guardada; los ceros quedan vacíos para escribir encima. */
export function valoresDePartida(partida: PartidaVista): ValoresIniciales {
  return {
    cabecera: {
      fecha: partida.fecha.slice(0, 10),
      tipo: partida.tipo,
      sucursalId: partida.sucursalId,
      documentoTipo: partida.documentoTipo ?? "",
      documentoNumero: partida.documentoNumero ?? "",
      concepto: partida.concepto ?? "",
    },
    filas: partida.lineas.map((l) => ({
      clave: nuevaClave(),
      cuentaId: l.cuentaId,
      codigo: l.codigo,
      nombre: l.nombre,
      debe: pulirMonto(l.debe),
      haber: pulirMonto(l.haber),
    })),
  };
}

/** Datos que se envían a la API (POST o PUT): montos con dos decimales y textos vacíos como ausentes. */
export function aEntradaApi({ cabecera, filas }: ValoresIniciales): CrearPartidaEntrada {
  return {
    ...cabecera,
    lineas: filas.map((f) => ({
      cuentaId: f.cuentaId,
      debe: montoParaApi(f.debe),
      haber: montoParaApi(f.haber),
    })),
  };
}

/** Huella para saber si el formulario cambió respecto de lo guardado. */
export const huella = ({ cabecera, filas }: ValoresIniciales) =>
  JSON.stringify([cabecera, filas.map(({ cuentaId, debe, haber }) => [cuentaId, debe, haber])]);
