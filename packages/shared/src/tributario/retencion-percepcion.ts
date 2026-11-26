import { Dinero } from "../dinero/dinero";
import { calcularTotalesDocumento, type OperacionComercial } from "../comercial/calculo-documento";
import type { ClasificacionContribuyente } from "../esquemas/enums";

export type TipoRetencionPercepcion = "retencion" | "percepcion" | "ninguna";
/** Sufrida: la aplica otro a la empresa (es un activo). Efectuada: la empresa la aplica a otro (es un pasivo por enterar). */
export type SentidoRetencionPercepcion = "sufrida" | "efectuada";
export type MotivoSinRetencionPercepcion = "bajo_minimo" | "ninguno_grande" | "ambos_grandes";

export interface EntradaRetencionPercepcion {
  /** Clasificación de la empresa que registra */
  empresa: ClasificacionContribuyente;
  /** Clasificación del cliente o proveedor */
  tercero: ClasificacionContribuyente;
  operacion: OperacionComercial;
  /** Base gravada del comprobante de crédito fiscal, sin IVA */
  base: string;
}

export interface ResultadoRetencionPercepcion {
  tipo: TipoRetencionPercepcion;
  sentido: SentidoRetencionPercepcion | null;
  monto: string;
  /** Por qué no aplica; nulo cuando sí aplica */
  motivo: MotivoSinRetencionPercepcion | null;
}

/**
 * Qué hace el sistema con una operación (retención o percepción del 1 % de IVA). No tiene regla propia: calcula un
 * comprobante de crédito fiscal con las mismas reglas que los documentos, para que la prueba y el registro no discrepen.
 */
export function evaluarRetencionPercepcion(
  entrada: EntradaRetencionPercepcion,
): ResultadoRetencionPercepcion {
  const base = Dinero.de(entrada.base);
  const totales = calcularTotalesDocumento({
    operacion: entrada.operacion,
    tipoDocumento: "ccf",
    lineas: [{ monto: base.aTexto(), clase: "gravada" }],
    empresa: entrada.empresa,
    tercero: entrada.tercero,
  });
  const retenido = Dinero.de(totales.ivaRetenido);
  const percibido = Dinero.de(totales.ivaPercibido);
  if (!retenido.esCero() || !percibido.esCero()) {
    const esRetencion = !retenido.esCero();
    // Compra: retener es aplicarlo al proveedor y percibir es que nos lo cobren. Venta, al revés.
    const efectuada = entrada.operacion === "compra" ? esRetencion : !esRetencion;
    return {
      tipo: esRetencion ? "retencion" : "percepcion",
      sentido: efectuada ? "efectuada" : "sufrida",
      monto: (esRetencion ? retenido : percibido).aTexto(),
      motivo: null,
    };
  }
  const grandeEmpresa = entrada.empresa === "grande";
  const grandeTercero = entrada.tercero === "grande";
  const motivo: MotivoSinRetencionPercepcion =
    grandeEmpresa && grandeTercero
      ? "ambos_grandes"
      : !grandeEmpresa && !grandeTercero
        ? "ninguno_grande"
        : "bajo_minimo";
  return { tipo: "ninguna", sentido: null, monto: "0.00", motivo };
}
