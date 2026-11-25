import type { ClasificacionContribuyente } from "./enums";

/** Un documento con retención o percepción del 1 % de IVA del mes. */
export interface FilaRetencionPercepcion {
  documentoId: string;
  /** AAAA-MM-DD */
  fecha: string;
  tipoDocumento: "ccf" | "factura" | "exportacion";
  numeroDocumento: string;
  operacion: "compra" | "venta";
  tercero: string | null;
  clasificacionTercero: ClasificacionContribuyente;
  baseGravada: string;
  tipo: "retencion" | "percepcion";
  /** Sufrida: la aplica otro a la empresa. Efectuada: la empresa la aplica a otro y debe enterarla. */
  sentido: "sufrida" | "efectuada";
  /** Monto del 1 %; en cero si el documento está anulado. */
  monto: string;
  anulado: boolean;
}

/** Retenciones y percepciones del 1 % de IVA de un mes, tal como se reflejan en los libros y en la liquidación. */
export interface RetencionPercepcionVista {
  anio: number;
  mes: number;
  clasificacionEmpresa: ClasificacionContribuyente;
  filas: FilaRetencionPercepcion[];
  totales: {
    /** Percibido por proveedores en nuestras compras: baja el IVA por pagar. */
    percibidoSufrido: string;
    /** Retenido por clientes en nuestras ventas: baja el IVA por pagar. */
    retenidoSufrido: string;
    /** Percibido por la empresa en sus ventas: se entera aparte. */
    percibidoEfectuado: string;
    /** Retenido por la empresa en sus compras: se entera aparte. */
    retenidoEfectuado: string;
  };
}
