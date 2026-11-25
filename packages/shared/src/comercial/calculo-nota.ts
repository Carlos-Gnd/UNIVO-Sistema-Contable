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
  // La retención recae sobre todo lo gravado; la percepción solo sobre los bienes (art. 163 del Código Tributario)
  const retencion = Dinero.de(t.totalGravado).porcentaje(TASA_RETENCION_PERCEPCION);
  const percepcion = Dinero.sumar(
    entrada.lineas.filter((l) => l.clase === "gravada" && l.bien !== false).map((l) => l.monto),
  ).porcentaje(TASA_RETENCION_PERCEPCION);
  const percibido = tenia(documento.ivaPercibido) ? percepcion : Dinero.cero();
  const retenido = tenia(documento.ivaRetenido) ? retencion : Dinero.cero();
  const total = Dinero.sumar([t.totalGravado, t.totalExento, t.totalNoSujeto, t.iva]).mas(percibido);
  return {
    ...t,
    ivaPercibido: percibido.aTexto(),
    ivaRetenido: retenido.aTexto(),
    total: total.aTexto(),
    totalNeto: total.menos(retenido).aTexto(),
  };
}
