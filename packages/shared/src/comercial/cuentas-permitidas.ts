import type { OperacionComercial } from "./calculo-documento";

/**
 * Motivo por el que una cuenta contable no puede usarse en una línea de compra o venta sin producto, o null si sirve.
 * Las líneas con cuenta no pasan por el kardex: por eso no se aceptan inventarios (1109…) ni efectivo (1101…), que
 * descuadrarían el inventario o el pago, y las ventas solo acreditan cuentas de ingresos (5…).
 */
export function motivoCuentaNoPermitida(operacion: OperacionComercial, codigo: string): string | null {
  if (codigo.startsWith("1109")) {
    return `La cuenta ${codigo} es de inventarios: la mercadería entra y sale por un producto del kardex. Elige un producto.`;
  }
  if (codigo.startsWith("1101")) {
    return `La cuenta ${codigo} es de caja o bancos: el pago o cobro se indica en la condición de pago, no como línea.`;
  }
  if (operacion === "venta" && !codigo.startsWith("5")) {
    return `La cuenta ${codigo} no es de ingresos: una línea de venta sin producto debe acreditar una cuenta de ingresos (5…).`;
  }
  return null;
}
