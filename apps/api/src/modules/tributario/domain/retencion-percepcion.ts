import {
  Dinero,
  type ClasificacionContribuyente,
  type FilaRetencionPercepcion,
  type RetencionPercepcionVista,
} from "@contable/shared";

/** Documento con retención o percepción del 1 % tal como sale de la base (partida contabilizada o anulada). */
export interface DocumentoConUnoPorCiento {
  id: string;
  fecha: string;
  tipoDocumento: FilaRetencionPercepcion["tipoDocumento"];
  numeroDocumento: string;
  operacion: "compra" | "venta";
  tercero: string | null;
  clasificacionTercero: ClasificacionContribuyente;
  totalGravado: string;
  ivaPercibido: string;
  ivaRetenido: string;
  anulado: boolean;
}

/**
 * Filas y totales de las retenciones y percepciones del mes. Un documento anulado se lista sin monto. Sufrida es la
 * que aplica otro a la empresa (compra con percepción, venta con retención); efectuada, la que aplica la empresa.
 */
export function armarRetencionesPercepciones(
  anio: number,
  mes: number,
  clasificacionEmpresa: ClasificacionContribuyente,
  documentos: readonly DocumentoConUnoPorCiento[],
): RetencionPercepcionVista {
  const filas: FilaRetencionPercepcion[] = [];
  const ordenados = [...documentos].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.numeroDocumento.localeCompare(b.numeroDocumento, "es"),
  );
  for (const d of ordenados) {
    for (const tipo of ["percepcion", "retencion"] as const) {
      const monto = tipo === "percepcion" ? d.ivaPercibido : d.ivaRetenido;
      if (Dinero.de(monto).esCero()) continue;
      const efectuada = d.operacion === "compra" ? tipo === "retencion" : tipo === "percepcion";
      filas.push({
        documentoId: d.id,
        fecha: d.fecha,
        tipoDocumento: d.tipoDocumento,
        numeroDocumento: d.numeroDocumento,
        operacion: d.operacion,
        tercero: d.tercero,
        clasificacionTercero: d.clasificacionTercero,
        baseGravada: d.anulado ? "0.00" : Dinero.de(d.totalGravado).aTexto(),
        tipo,
        sentido: efectuada ? "efectuada" : "sufrida",
        monto: d.anulado ? "0.00" : Dinero.de(monto).aTexto(),
        anulado: d.anulado,
      });
    }
  }
  const suma = (tipo: FilaRetencionPercepcion["tipo"], sentido: FilaRetencionPercepcion["sentido"]) =>
    Dinero.sumar(filas.filter((f) => f.tipo === tipo && f.sentido === sentido).map((f) => f.monto)).aTexto();
  return {
    anio,
    mes,
    clasificacionEmpresa,
    filas,
    totales: {
      percibidoSufrido: suma("percepcion", "sufrida"),
      retenidoSufrido: suma("retencion", "sufrida"),
      percibidoEfectuado: suma("percepcion", "efectuada"),
      retenidoEfectuado: suma("retencion", "efectuada"),
    },
  };
}
