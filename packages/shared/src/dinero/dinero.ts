import Decimal from "decimal.js";

/** Valores aceptados como monto: texto ("1250.10"), número entero o decimal, u otro Dinero. */
export type Monto = string | number | Dinero;

// Configuración propia para no alterar la instancia global de decimal.js
const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/**
 * Monto en dólares con aritmética decimal exacta, redondeado a centavos (2 decimales, medio hacia arriba).
 * Todo cálculo contable del sistema debe pasar por esta clase: nunca usar number para sumar montos.
 */
export class Dinero {
  private constructor(private readonly valor: Decimal) {}

  static de(monto: Monto): Dinero {
    if (monto instanceof Dinero) return monto;
    let d: Decimal;
    try {
      d = new D(monto);
    } catch {
      throw new Error(`Monto inválido: ${String(monto)}`);
    }
    if (!d.isFinite()) throw new Error(`Monto inválido: ${String(monto)}`);
    return new Dinero(d.toDecimalPlaces(2));
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
    return new Dinero(this.valor.times(new D(factor)).toDecimalPlaces(2));
  }

  /** Porcentaje del monto, por ejemplo porcentaje(13) para el IVA. */
  porcentaje(tasa: string | number): Dinero {
    return new Dinero(this.valor.times(new D(tasa)).dividedBy(100).toDecimalPlaces(2));
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
