import { Dinero } from "../dinero/dinero";
import type { ClasificacionContribuyente } from "../esquemas/enums";

/** Tasa del IVA en El Salvador (porcentaje). */
export const TASA_IVA = "13";
/** Tasa de la retención y la percepción del IVA para grandes contribuyentes (porcentaje). */
export const TASA_RETENCION_PERCEPCION = "1";
/** Base gravada mínima de un comprobante de crédito fiscal para que proceda la retención o percepción. */
export const MINIMO_RETENCION_PERCEPCION = "100.00";

export type OperacionComercial = "compra" | "venta";
export type TipoDocumentoComercial = "ccf" | "factura" | "exportacion";
export type ClaseGravamen = "gravada" | "exenta" | "no_sujeta";

export interface LineaParaCalculo {
  /** Importe de la línea como figura en el documento: sin IVA en un CCF; con IVA en una factura de consumidor final */
  monto: string;
  clase: ClaseGravamen;
  /**
   * La línea transfiere un bien (un producto del inventario). La percepción del 1 % solo recae sobre bienes
   * (art. 163 del Código Tributario); la retención cubre también servicios. Sin valor se trata como bien.
   */
  bien?: boolean;
}

export interface EntradaCalculoDocumento {
  operacion: OperacionComercial;
  tipoDocumento: TipoDocumentoComercial;
  lineas: readonly LineaParaCalculo[];
  /** Clasificación de la empresa que registra */
  empresa: ClasificacionContribuyente;
  /** Clasificación del proveedor o cliente; sin tercero (consumidor final) se trata como «otro» */
  tercero: ClasificacionContribuyente;
}

export interface TotalesDocumento {
  totalGravado: string;
  totalExento: string;
  totalNoSujeto: string;
  /** IVA del documento: crédito fiscal en una compra con CCF, débito fiscal en una venta */
  iva: string;
  /** 1 % de IVA que cobra al documento el proveedor (compra) o que cobra la empresa (venta) cuando es gran contribuyente */
  ivaPercibido: string;
  /** 1 % de IVA que la empresa retiene al proveedor (compra) o que el cliente gran contribuyente le retiene (venta) */
  ivaRetenido: string;
  /** Total del documento: gravado + exento + no sujeto + IVA + IVA percibido */
  total: string;
  /** Lo que realmente se paga o se cobra: el total menos el IVA retenido */
  totalNeto: string;
}

/**
 * Totales de un documento de compra o venta con decimales exactos (Dinero):
 * - CCF: el IVA es el 13 % de lo gravado.
 * - Factura de consumidor final en una venta: los importes ya incluyen el IVA; se separa la base y el IVA del total.
 * - Factura en una compra: no da crédito fiscal; el IVA que trae forma parte del costo (IVA en cero).
 * - Exportación (solo ventas): toda exenta, sin IVA.
 * - Retención o percepción del 1 % solo en CCF con base gravada de US$ 100 o más: la aplica la empresa cuando es gran
 *   contribuyente y el tercero no lo es; en sentido contrario, el tercero gran contribuyente la aplica a la empresa.
 *   La retención se calcula sobre todo lo gravado (bienes y servicios); la percepción solo sobre lo gravado de
 *   bienes (art. 163 del Código Tributario), y su mínimo se mide sobre esa base.
 *   Pendiente de confirmar con la docente: el mínimo de US$ 100 y el texto exacto del artículo.
 */
export function calcularTotalesDocumento(entrada: EntradaCalculoDocumento): TotalesDocumento {
  const suma = (clase: ClaseGravamen) =>
    Dinero.sumar(entrada.lineas.filter((l) => l.clase === clase).map((l) => l.monto));
  let gravado = suma("gravada");
  const baseBienes = Dinero.sumar(
    entrada.lineas.filter((l) => l.clase === "gravada" && l.bien !== false).map((l) => l.monto),
  );
  const exento = suma("exenta");
  const noSujeto = suma("no_sujeta");
  let iva = Dinero.cero();

  if (entrada.tipoDocumento === "ccf") {
    iva = gravado.porcentaje(TASA_IVA);
  } else if (entrada.tipoDocumento === "factura" && entrada.operacion === "venta") {
    // El precio ya trae el IVA: base = total ÷ 1.13, redondeada al centavo, y el IVA es la diferencia
    const bruto = gravado;
    gravado = bruto.dividido("1.13");
    iva = bruto.menos(gravado);
  }

  let percibido = Dinero.cero();
  let retenido = Dinero.cero();
  if (entrada.tipoDocumento === "ccf") {
    const alcanza = (base: Dinero) => !base.menos(MINIMO_RETENCION_PERCEPCION).esNegativo();
    const retencion = alcanza(gravado) ? gravado.porcentaje(TASA_RETENCION_PERCEPCION) : Dinero.cero();
    const percepcion = alcanza(baseBienes) ? baseBienes.porcentaje(TASA_RETENCION_PERCEPCION) : Dinero.cero();
    const empresaGrande = entrada.empresa === "grande";
    const terceroGrande = entrada.tercero === "grande";
    if (entrada.operacion === "compra") {
      if (empresaGrande && !terceroGrande) retenido = retencion;
      else if (terceroGrande && !empresaGrande) percibido = percepcion;
    } else if (empresaGrande && !terceroGrande) {
      percibido = percepcion;
    } else if (terceroGrande && !empresaGrande) {
      retenido = retencion;
    }
  }

  const total = gravado.mas(exento).mas(noSujeto).mas(iva).mas(percibido);
  return {
    totalGravado: gravado.aTexto(),
    totalExento: exento.aTexto(),
    totalNoSujeto: noSujeto.aTexto(),
    iva: iva.aTexto(),
    ivaPercibido: percibido.aTexto(),
    ivaRetenido: retenido.aTexto(),
    total: total.aTexto(),
    totalNeto: total.menos(retenido).aTexto(),
  };
}
