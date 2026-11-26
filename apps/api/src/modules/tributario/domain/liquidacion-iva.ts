import {
  Dinero,
  type CifrasMesIva,
  type LiquidacionIvaVista,
  type RetencionPercepcionVista,
} from "@contable/shared";

export interface AccesoLiquidacionIva {
  permisos: ReadonlySet<string>;
  todasSucursales: boolean;
}

export class EmpresaLiquidacionIvaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o el usuario no tiene acceso a ella.");
  }
}
export class SinPermisoLiquidacionIvaError extends Error {}
export class AlcanceLiquidacionIvaIncompletoError extends Error {}
export class ConflictoLiquidacionIvaError extends Error {}
export class ReglaLiquidacionIvaError extends Error {}
export class LiquidacionIvaNoEncontradaError extends Error {
  constructor() {
    super("Todavía no se generó la partida de liquidación del IVA de ese mes.");
  }
}

/**
 * Cifras de un mes tal como salen de los documentos con partida contabilizada (los libros de IVA muestran en cero los
 * anulados): las de la liquidación más las retenciones y percepciones que la empresa aplicó a otros.
 */
export interface CifrasMesLibros extends CifrasMesIva {
  debitoContribuyentes: string;
  debitoConsumidorFinal: string;
  /** 1 % que la empresa percibió en sus ventas: se entera aparte, no reduce el IVA. */
  percibidoEfectuado: string;
  /** 1 % que la empresa retuvo en sus compras: se entera aparte, no reduce el IVA. */
  retenidoEfectuado: string;
}

export interface UnidadLiquidacionIva {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoLiquidacionIva | null>;
  consultar(empresaId: string, anio: number, mes: number): Promise<LiquidacionIvaVista>;
  generarPartida(empresaId: string, anio: number, mes: number): Promise<LiquidacionIvaVista>;
  presentar(usuarioId: string, empresaId: string, anio: number, mes: number): Promise<LiquidacionIvaVista>;
  /** Documentos del mes con retención o percepción del 1 %, para la pestaña de retención y percepción (HU-50). */
  retencionesDelMes(empresaId: string, anio: number, mes: number): Promise<RetencionPercepcionVista>;
}

export interface RepositorioLiquidacionIva {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadLiquidacionIva) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_LIQUIDACION_IVA = Symbol("REPOSITORIO_LIQUIDACION_IVA");

/** Suma por mes, operación y tipo de documento de los documentos con partida contabilizada. */
export interface FilaAgregadaIva {
  /** AAAA-MM */
  mes: string;
  operacion: "compra" | "venta";
  tipoDocumento: "ccf" | "factura" | "exportacion";
  iva: string;
  ivaPercibido: string;
  ivaRetenido: string;
}

/** Mes siguiente a uno dado, como AAAA-MM. */
export function mesSiguiente(mes: string): string {
  const anio = Number(mes.slice(0, 4));
  const n = Number(mes.slice(5, 7));
  return n === 12 ? `${anio + 1}-01` : `${anio}-${String(n + 1).padStart(2, "0")}`;
}

/**
 * Cifras de cada mes desde el primero con documentos hasta `mesFinal`, sin saltos (un mes sin movimiento queda en
 * cero) para que el remanente se traslade de mes a mes. Débito fiscal: IVA de las ventas; crédito fiscal: IVA de las
 * compras; percibido sufrido: el 1 % de las compras; retenido sufrido: el 1 % de las ventas. Lo que la empresa
 * percibe en sus ventas o retiene en sus compras se separa porque se entera aparte.
 */
export function cifrasPorMes(
  filas: readonly FilaAgregadaIva[],
  mesFinal: string,
): { mes: string; cifras: CifrasMesLibros }[] {
  const desde = filas.map((f) => f.mes).sort()[0];
  if (desde === undefined || desde > mesFinal) return [];
  const resultado: { mes: string; cifras: CifrasMesLibros }[] = [];
  for (let mes = desde; mes <= mesFinal; mes = mesSiguiente(mes)) {
    const delMes = filas.filter((f) => f.mes === mes);
    const suma = (
      filtro: (f: FilaAgregadaIva) => boolean,
      campo: "iva" | "ivaPercibido" | "ivaRetenido",
    ): string => Dinero.sumar(delMes.filter(filtro).map((f) => f[campo])).aTexto();
    const venta = (f: FilaAgregadaIva) => f.operacion === "venta";
    const compra = (f: FilaAgregadaIva) => f.operacion === "compra";
    const debitoContribuyentes = suma((f) => venta(f) && f.tipoDocumento === "ccf", "iva");
    const debitoConsumidorFinal = suma((f) => venta(f) && f.tipoDocumento !== "ccf", "iva");
    resultado.push({
      mes,
      cifras: {
        debitoContribuyentes,
        debitoConsumidorFinal,
        debitoFiscal: Dinero.sumar([debitoContribuyentes, debitoConsumidorFinal]).aTexto(),
        creditoFiscal: suma(compra, "iva"),
        percibidoSufrido: suma(compra, "ivaPercibido"),
        retenidoSufrido: suma(venta, "ivaRetenido"),
        percibidoEfectuado: suma(venta, "ivaPercibido"),
        retenidoEfectuado: suma(compra, "ivaRetenido"),
      },
    });
  }
  return resultado;
}
