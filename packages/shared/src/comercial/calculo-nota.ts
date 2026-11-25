import { Dinero } from "../dinero/dinero";
import { TASA_RETENCION_PERCEPCION, calcularTotalesDocumento } from "./calculo-documento";
import type { EntradaCalculoDocumento, TotalesDocumento } from "./calculo-documento";

/**
 * Totales de una nota de crédito o de débito (HU-61): se calculan con las reglas del documento que corrige.
 * La retención o percepción del 1 % se mantiene en la misma proporción aunque la nota no llegue al mínimo de
 * US$ 100: si el documento la tenía, la nota la revierte (o la agrega) sobre su propia base gravada, de modo que
 * el saldo por cobrar o por pagar baje exactamente lo que se cobró o se pagó de más.
 */
export function calcularTotalesNota(
  entrada: EntradaCalculoDocumento,
  documento: Pick<TotalesDocumento, "ivaPercibido" | "ivaRetenido">,
): TotalesDocumento {
  const t = calcularTotalesDocumento(entrada);
  const tenia = (v: string) => !Dinero.de(v).esCero();
  if (entrada.tipoDocumento !== "ccf" || (!tenia(documento.ivaPercibido) && !tenia(documento.ivaRetenido)))
    return t;
  const uno = Dinero.de(t.totalGravado).porcentaje(TASA_RETENCION_PERCEPCION);
  const percibido = tenia(documento.ivaPercibido) ? uno : Dinero.cero();
  const retenido = tenia(documento.ivaRetenido) ? uno : Dinero.cero();
  const total = Dinero.sumar([t.totalGravado, t.totalExento, t.totalNoSujeto, t.iva]).mas(percibido);
  return {
    ...t,
    ivaPercibido: percibido.aTexto(),
    ivaRetenido: retenido.aTexto(),
    total: total.aTexto(),
    totalNeto: total.menos(retenido).aTexto(),
  };
}
