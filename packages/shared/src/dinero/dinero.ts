import Decimal from "decimal.js";

/** Valores aceptados como monto: texto ("1250.10"), número entero o decimal, u otro Dinero. */
export type Monto = string | number | Dinero;

// Configuración propia para no alterar la instancia global de decimal.js
const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/** Máximo absoluto que cabe en NUMERIC(14,2): 12 dígitos enteros. */
const LIMITE = new D("1e12");
/** Solo formato decimal simple: sin exponentes ("1e9"), espacios internos ni otros caracteres. */
const FORMATO = /^-?\d{1,15}(\.\d{1,10})?$/;

/** Convierte texto o número a decimal, rechazando notación exponencial y valores no finitos. */
function aDecimal(valor: string | number): Decimal {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new Error(`Monto inválido: ${String(valor)}`);
    return new D(valor);
  }
  const texto = valor.trim();
  if (!FORMATO.test(texto)) throw new Error(`Monto inválido: ${valor.slice(0, 30)}`);
  return new D(texto);
}

/**
 * Monto en dólares con aritmética decimal exacta, redondeado a centavos (2 decimales, medio hacia arriba).
 * Todo cálculo contable del sistema debe pasar por esta clase: nunca usar number para sumar montos.
 */
export class Dinero {
  private constructor(private readonly valor: Decimal) {
    if (valor.abs().greaterThanOrEqualTo(LIMITE)) {
      throw new Error("Monto fuera de rango: el máximo es 999,999,999,999.99");
    }
  }

  static de(monto: Monto): Dinero {
    if (monto instanceof Dinero) return monto;
    return new Dinero(aDecimal(monto).toDecimalPlaces(2));
  }

  static cero(): Dinero {
    return new Dinero(new D(0));
  }

  static sumar(montos: Iterable<Monto>): Dinero {
    let total = Dinero.cero();
    for (const m of montos) total = total.mas(m);
    return total;
  }

  mas(otro: Monto): Dinero {
    return new Dinero(this.valor.plus(Dinero.de(otro).valor).toDecimalPlaces(2));
  }

  menos(otro: Monto): Dinero {
    return new Dinero(this.valor.minus(Dinero.de(otro).valor).toDecimalPlaces(2));
  }

  /** Multiplica por un factor (cantidad, tasa) y redondea al centavo. */
  por(factor: string | number): Dinero {
    return new Dinero(this.valor.times(aDecimal(factor)).toDecimalPlaces(2));
  }

  /** Porcentaje del monto, por ejemplo porcentaje(13) para el IVA. */
  porcentaje(tasa: string | number): Dinero {
    return new Dinero(this.valor.times(aDecimal(tasa)).dividedBy(100).toDecimalPlaces(2));
  }

  abs(): Dinero {
    return new Dinero(this.valor.abs());
  }

  igualA(otro: Monto): boolean {
    return this.valor.equals(Dinero.de(otro).valor);
  }

  mayorQue(otro: Monto): boolean {
    return this.valor.greaterThan(Dinero.de(otro).valor);
  }

  esCero(): boolean {
    return this.valor.isZero();
  }

  esNegativo(): boolean {
    return this.valor.isNegative() && !this.valor.isZero();
  }

  /** Texto con dos decimales, apto para guardar en NUMERIC(14,2) o enviar por la API. */
  aTexto(): string {
    return this.valor.toFixed(2);
  }

  /** Formato de presentación: $1,234.50 */
  formatear(): string {
    const [entero, decimales] = this.valor.abs().toFixed(2).split(".");
    const conMiles = (entero ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${this.esNegativo() ? "-" : ""}$${conMiles}.${decimales}`;
  }

  toString(): string {
    return this.aTexto();
  }

  toJSON(): string {
    return this.aTexto();
  }
}
