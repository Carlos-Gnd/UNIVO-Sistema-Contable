import {
  Dinero,
  TRAMOS_ANTIGUEDAD,
  type AntiguedadSaldos,
  type DocumentoAntiguedad,
  type FilaAntiguedad,
  type MontosPorTramo,
  type OperacionComercial,
  type TipoDocumentoComercial,
  type TramoAntiguedad,
} from "@contable/shared";

/** Documento al crédito con su saldo a la fecha de corte, tal como lo entrega el repositorio. */
export interface SaldoDocumentoAl {
  documentoId: string;
  tipoDocumento: TipoDocumentoComercial;
  numeroDocumento: string;
  fecha: string;
  fechaVencimiento: string;
  sucursalId: string;
  tercero: { id: string; nombre: string };
  saldo: string;
}

export interface FiltroAntiguedad {
  operacion: OperacionComercial;
  alFecha: string;
  terceroId?: string | undefined;
  /** Sucursales que puede ver el usuario; null si ve todas */
  sucursales: readonly string[] | null;
}

const MS_DIA = 86_400_000;

/** Días entre dos fechas AAAA-MM-DD (a menos b), sin zonas horarias. */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00.000Z`) - Date.parse(`${b}T00:00:00.000Z`)) / MS_DIA);
}

/** Tramo según los días de atraso al corte: hasta 0 es corriente. */
export function tramoDe(diasVencido: number): TramoAntiguedad {
  if (diasVencido <= 0) return "corriente";
  if (diasVencido <= 30) return "d1_30";
  if (diasVencido <= 60) return "d31_60";
  if (diasVencido <= 90) return "d61_90";
  return "mas_90";
}

const montosEnCero = (): MontosPorTramo => ({
  corriente: "0.00",
  d1_30: "0.00",
  d31_60: "0.00",
  d61_90: "0.00",
  mas_90: "0.00",
});

const sumarTramos = (a: MontosPorTramo, tramo: TramoAntiguedad, monto: string): MontosPorTramo => ({
  ...a,
  [tramo]: Dinero.de(a[tramo]).mas(monto).aTexto(),
});

const totalDe = (m: MontosPorTramo): string => Dinero.sumar(TRAMOS_ANTIGUEDAD.map((t) => m[t])).aTexto();

/**
 * Agrupa los saldos por cliente o proveedor y por tramo de atraso, y los compara con el saldo de la cuenta del mayor:
 * si el reporte y el mayor difieren, `cuadre.cuadra` es falso y `diferencia` dice cuánto (un movimiento manual en la
 * cuenta de cuentas por cobrar o por pagar que no viene de un documento, por ejemplo).
 */
export function armarAntiguedad(
  operacion: OperacionComercial,
  alFecha: string,
  saldos: readonly SaldoDocumentoAl[],
  cuenta: { codigo: string; saldoMayor: string },
): AntiguedadSaldos {
  const porTercero = new Map<string, FilaAntiguedad>();
  let totales = montosEnCero();
  for (const s of saldos) {
    if (!Dinero.de(s.saldo).mayorQue(0)) continue;
    const diasVencido = diasEntre(alFecha, s.fechaVencimiento);
    const tramo = tramoDe(diasVencido);
    const documento: DocumentoAntiguedad = {
      documentoId: s.documentoId,
      tipoDocumento: s.tipoDocumento,
      numeroDocumento: s.numeroDocumento,
      fecha: s.fecha,
      fechaVencimiento: s.fechaVencimiento,
      diasVencido,
      tramo,
      saldo: Dinero.de(s.saldo).aTexto(),
    };
    const fila = porTercero.get(s.tercero.id) ?? {
      tercero: s.tercero,
      tramos: montosEnCero(),
      total: "0.00",
      documentos: [],
    };
    fila.tramos = sumarTramos(fila.tramos, tramo, documento.saldo);
    fila.documentos.push(documento);
    porTercero.set(s.tercero.id, fila);
    totales = sumarTramos(totales, tramo, documento.saldo);
  }
  const filas = [...porTercero.values()]
    .map((f) => ({
      ...f,
      total: totalDe(f.tramos),
      documentos: f.documentos.sort(
        (a, b) =>
          a.fechaVencimiento.localeCompare(b.fechaVencimiento) ||
          a.numeroDocumento.localeCompare(b.numeroDocumento),
      ),
    }))
    .sort((a, b) => a.tercero.nombre.localeCompare(b.tercero.nombre, "es"));
  const saldoReporte = totalDe(totales);
  const diferencia = Dinero.de(cuenta.saldoMayor).menos(saldoReporte);
  return {
    operacion,
    alFecha,
    filas,
    totales: { ...totales, total: saldoReporte },
    cuadre: {
      cuenta: cuenta.codigo,
      saldoMayor: Dinero.de(cuenta.saldoMayor).aTexto(),
      saldoReporte,
      diferencia: diferencia.aTexto(),
      cuadra: diferencia.esCero(),
    },
  };
}
