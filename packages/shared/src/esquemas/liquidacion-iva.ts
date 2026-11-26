import { z } from "zod";
import type { RemanenteIva } from "../tributario/liquidacion-iva";

/** Mes del F-07 que se consulta o se genera. */
export const periodoLiquidacionIvaSchema = z
  .object({
    anio: z.coerce.number().int().min(2000).max(2100),
    mes: z.coerce.number().int().min(1).max(12),
  })
  .strict();
export type PeriodoLiquidacionIva = z.infer<typeof periodoLiquidacionIvaSchema>;

export type EstadoPartidaLiquidacionIva = "borrador" | "contabilizada" | "anulada";

export interface LineaPartidaLiquidacionIva {
  codigo: string;
  nombre: string;
  debe: string;
  haber: string;
}

/** Lo que quedó guardado al generar la partida de liquidación del mes. */
export interface DeclaracionLiquidacionIvaVista {
  id: string;
  partidaId: string;
  estadoPartida: EstadoPartidaLiquidacionIva;
  numeroPartida: number | null;
  debitoFiscal: string;
  ivaPorPagar: string;
  remanenteTotal: string;
  presentadaEn: string | null;
  /** Las cifras del mes cambiaron después de generar la partida. */
  desactualizada: boolean;
}

/** F-07 de un mes: cálculo actual desde los libros de IVA y, si ya se generó, la liquidación guardada. */
export interface LiquidacionIvaVista {
  anio: number;
  mes: number;
  /** Último día del mes, fecha de la partida de liquidación. */
  fechaPartida: string;
  debitoContribuyentes: string;
  debitoConsumidorFinal: string;
  debitoFiscal: string;
  creditoFiscal: string;
  /** 1 % que nos percibieron los proveedores en las compras. */
  percibidoSufrido: string;
  /** 1 % que nos retuvieron los clientes en las ventas. */
  retenidoSufrido: string;
  remanenteAnterior: RemanenteIva;
  remanenteAnteriorTotal: string;
  ivaPorPagar: string;
  remanente: RemanenteIva;
  remanenteTotal: string;
  /** 1 % que nosotros percibimos en las ventas (por enterar, no reduce el IVA). */
  percibidoEfectuado: string;
  /** 1 % que nosotros retuvimos en las compras (por enterar, no reduce el IVA). */
  retenidoEfectuado: string;
  /** IVA por pagar más las retenciones y percepciones efectuadas, lo que se entera con el F-07. */
  totalAEnterar: string;
  /** Partida que se generaría con las cifras actuales (vista previa). */
  lineasPartida: LineaPartidaLiquidacionIva[];
  declaracion: DeclaracionLiquidacionIvaVista | null;
  /** Estado del período contable del mes: la partida solo se genera en un período abierto. */
  periodoAbierto: boolean;
}
