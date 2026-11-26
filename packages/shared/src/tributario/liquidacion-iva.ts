import { Dinero } from "../dinero/dinero";

/** Cuentas del catálogo base que usa la liquidación mensual del IVA (F-07). */
export const CUENTAS_LIQUIDACION_IVA = {
  /** Pasivo: IVA cobrado en las ventas del mes. */
  debitoFiscal: "2109",
  /** Activo: IVA pagado en las compras del mes (y remanentes de meses anteriores). */
  creditoFiscal: "1112",
  /** Activo: 1 % de IVA que un proveedor gran contribuyente nos percibió en las compras. */
  ivaPercibidoSufrido: "111301",
  /** Activo: 1 % de IVA que un cliente gran contribuyente nos retuvo en las ventas. */
  ivaRetenidoSufrido: "111302",
  /** Pasivo: IVA por pagar a Hacienda (Impuestos por Pagar, subcuenta IVA). */
  ivaPorPagar: "211103",
} as const;

/** Lo que sobra de meses anteriores, separado por la cuenta del activo donde quedó. */
export interface RemanenteIva {
  credito: string;
  percibido: string;
  retenido: string;
}

export interface EntradaLiquidacionIva {
  /** Débito fiscal del mes: IVA de las ventas (contribuyentes y consumidor final). */
  debitoFiscal: string;
  /** Crédito fiscal del mes: IVA de las compras con CCF. */
  creditoFiscal: string;
  /** IVA percibido por proveedores en nuestras compras (1 %). */
  percibidoSufrido: string;
  /** IVA retenido por clientes en nuestras ventas (1 %). */
  retenidoSufrido: string;
  /** Remanente del mes anterior, trasladado automáticamente. */
  remanenteAnterior: RemanenteIva;
}

export interface ResultadoLiquidacionIva {
  debitoFiscal: string;
  creditoFiscal: string;
  percibidoSufrido: string;
  retenidoSufrido: string;
  remanenteAnterior: RemanenteIva;
  /** Lo que se aplica contra el débito fiscal, cuenta por cuenta, en este orden: crédito fiscal, percibido, retenido. */
  usoCredito: string;
  usoPercibido: string;
  usoRetenido: string;
  /** IVA a pagar: el débito que los créditos no cubren. */
  ivaPorPagar: string;
  /** Lo que sobra y se traslada al mes siguiente. */
  remanente: RemanenteIva;
  remanenteTotal: string;
}

const noNegativo = (valor: Dinero) => (valor.esNegativo() ? Dinero.cero() : valor);
const menor = (a: Dinero, b: Dinero) => (a.mayorQue(b) ? b : a);

export const REMANENTE_CERO: RemanenteIva = { credito: "0.00", percibido: "0.00", retenido: "0.00" };

/**
 * Liquida el IVA del mes (F-07): débito fiscal menos crédito fiscal, menos las retenciones y percepciones sufridas,
 * y menos el remanente del mes anterior. Primero se agota el crédito fiscal, luego el IVA percibido y por último el
 * retenido. Si los créditos superan el débito, no hay nada que pagar y la diferencia se traslada al mes siguiente
 * (en la misma cuenta donde quedó). Todo con Dinero, a centavos exactos.
 */
export function calcularLiquidacionIva(entrada: EntradaLiquidacionIva): ResultadoLiquidacionIva {
  const debito = noNegativo(Dinero.de(entrada.debitoFiscal));
  const disponibleCredito = noNegativo(
    Dinero.de(entrada.creditoFiscal).mas(entrada.remanenteAnterior.credito),
  );
  const disponiblePercibido = noNegativo(
    Dinero.de(entrada.percibidoSufrido).mas(entrada.remanenteAnterior.percibido),
  );
  const disponibleRetenido = noNegativo(
    Dinero.de(entrada.retenidoSufrido).mas(entrada.remanenteAnterior.retenido),
  );

  const usoCredito = menor(debito, disponibleCredito);
  const usoPercibido = menor(debito.menos(usoCredito), disponiblePercibido);
  const usoRetenido = menor(debito.menos(usoCredito).menos(usoPercibido), disponibleRetenido);
  const porPagar = debito.menos(usoCredito).menos(usoPercibido).menos(usoRetenido);

  const remanente: RemanenteIva = {
    credito: disponibleCredito.menos(usoCredito).aTexto(),
    percibido: disponiblePercibido.menos(usoPercibido).aTexto(),
    retenido: disponibleRetenido.menos(usoRetenido).aTexto(),
  };
  return {
    debitoFiscal: debito.aTexto(),
    creditoFiscal: Dinero.de(entrada.creditoFiscal).aTexto(),
    percibidoSufrido: Dinero.de(entrada.percibidoSufrido).aTexto(),
    retenidoSufrido: Dinero.de(entrada.retenidoSufrido).aTexto(),
    remanenteAnterior: {
      credito: Dinero.de(entrada.remanenteAnterior.credito).aTexto(),
      percibido: Dinero.de(entrada.remanenteAnterior.percibido).aTexto(),
      retenido: Dinero.de(entrada.remanenteAnterior.retenido).aTexto(),
    },
    usoCredito: usoCredito.aTexto(),
    usoPercibido: usoPercibido.aTexto(),
    usoRetenido: usoRetenido.aTexto(),
    ivaPorPagar: porPagar.aTexto(),
    remanente,
    remanenteTotal: Dinero.sumar([remanente.credito, remanente.percibido, remanente.retenido]).aTexto(),
  };
}

/** Cifras de un mes tal como salen de los libros, antes de aplicar el remanente. */
export interface CifrasMesIva {
  debitoFiscal: string;
  creditoFiscal: string;
  percibidoSufrido: string;
  retenidoSufrido: string;
}

/**
 * Encadena las liquidaciones de varios meses consecutivos (de más antiguo a más reciente) trasladando el remanente de
 * cada una a la siguiente. Devuelve el resultado de cada mes.
 */
export function encadenarLiquidaciones(meses: readonly CifrasMesIva[]): ResultadoLiquidacionIva[] {
  const resultados: ResultadoLiquidacionIva[] = [];
  let remanente: RemanenteIva = REMANENTE_CERO;
  for (const cifras of meses) {
    const resultado = calcularLiquidacionIva({ ...cifras, remanenteAnterior: remanente });
    resultados.push(resultado);
    remanente = resultado.remanente;
  }
  return resultados;
}
