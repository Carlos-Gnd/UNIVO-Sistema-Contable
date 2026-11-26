import type { ExplicacionDidacticaPartida, LineaPartidaVista, ReglaDidacticaPartida } from "@contable/shared";

const REGLAS: Record<string, ReglaDidacticaPartida> = {
  compras: {
    codigo: "compras",
    nombre: "Registro de compra",
    explicacion:
      "La compra reconoce el bien o gasto y los impuestos aplicables frente al pago o la cuenta por pagar.",
  },
  ventas: {
    codigo: "ventas",
    nombre: "Registro de venta",
    explicacion:
      "La venta reconoce el ingreso y los impuestos aplicables frente al efectivo o la cuenta por cobrar.",
  },
  ventas_costo: {
    codigo: "ventas_costo",
    nombre: "Costo de venta",
    explicacion:
      "El costo de los bienes vendidos se reconoce como gasto y reduce el inventario correspondiente.",
  },
  notas: {
    codigo: "notas",
    nombre: "Nota de crédito o débito",
    explicacion:
      "La nota ajusta el saldo del documento comercial original mediante la devolución, rebaja o cargo indicado.",
  },
  notas_costo: {
    codigo: "notas_costo",
    nombre: "Ajuste del costo por nota",
    explicacion:
      "El asiento ajusta el costo y las existencias cuando la nota modifica bienes previamente vendidos o devueltos.",
  },
  abonos: {
    codigo: "abonos",
    nombre: "Abono a documento comercial",
    explicacion:
      "El abono registra el pago recibido o realizado y reduce el saldo pendiente del documento relacionado.",
  },
  planilla: {
    codigo: "planilla",
    nombre: "Registro de planilla",
    explicacion:
      "La planilla reconoce los gastos laborales y las obligaciones de pago y retención correspondientes.",
  },
  prestaciones: {
    codigo: "prestaciones",
    nombre: "Prestaciones laborales",
    explicacion: "Las prestaciones reconocen el gasto laboral y la obligación pendiente con el empleado.",
  },
  depreciacion: {
    codigo: "depreciacion",
    nombre: "Depreciación de activo fijo",
    explicacion:
      "La depreciación reconoce el gasto del período y aumenta la depreciación acumulada del activo.",
  },
  cierre_anual: {
    codigo: "cierre_anual",
    nombre: "Cierre del ejercicio",
    explicacion:
      "El cierre traslada los saldos de las cuentas de resultado al patrimonio según la regla de cierre anual.",
  },
  reapertura_ejercicio: {
    codigo: "reapertura_ejercicio",
    nombre: "Reapertura del ejercicio",
    explicacion:
      "La partida revierte el cierre anterior para restablecer los saldos de las cuentas de resultado.",
  },
  isr_ejercicio: {
    codigo: "isr_ejercicio",
    nombre: "Impuesto sobre la renta",
    explicacion:
      "El asiento reconoce el impuesto sobre la renta calculado para el ejercicio y su saldo por pagar.",
  },
  liquidacion_iva: {
    codigo: "liquidacion_iva",
    nombre: "Liquidación de IVA",
    explicacion:
      "La liquidación compensa el débito y crédito fiscal del período y reconoce el remanente o impuesto por pagar.",
  },
  pago_a_cuenta: {
    codigo: "pago_a_cuenta",
    nombre: "Pago a cuenta",
    explicacion:
      "El asiento reconoce el anticipo de impuesto sobre la renta y la salida o cuenta de pago correspondiente.",
  },
  activo_fijo: {
    codigo: "activo_fijo",
    nombre: "Adquisición de activo fijo",
    explicacion: "La adquisición incorpora el activo fijo y reconoce el pago o la obligación asociada.",
  },
  movimiento_bancario: {
    codigo: "movimiento_bancario",
    nombre: "Movimiento bancario",
    explicacion:
      "El asiento registra el movimiento de efectivo según su tipo y las cuentas contables configuradas.",
  },
};

function esCero(monto: string): boolean {
  return monto === "0" || monto === "0.00";
}

/** Construye explicaciones y esquema T sin modificar ni recalcular los importes de la partida. */
export function explicarPartidaDidactica(
  origen: string,
  lineas: readonly LineaPartidaVista[],
): ExplicacionDidacticaPartida | null {
  if (origen === "manual") return null;

  const regla = REGLAS[origen] ?? {
    codigo: origen,
    nombre: `Regla contable: ${origen.replaceAll("_", " ")}`,
    explicacion:
      "La partida fue generada por el módulo indicado. El concepto y las cuentas muestran cómo se aplicó la partida doble a esta operación.",
  };
  const debe = lineas
    .filter((linea) => !esCero(linea.debe))
    .map(({ codigo, nombre, debe: monto }) => ({ codigo, nombre, monto }));
  const haber = lineas
    .filter((linea) => !esCero(linea.haber))
    .map(({ codigo, nombre, haber: monto }) => ({ codigo, nombre, monto }));

  return {
    regla,
    lineas: lineas.map((linea) => {
      const lado = !esCero(linea.debe) ? "debe" : !esCero(linea.haber) ? "haber" : "sin_movimiento";
      const importe = lado === "debe" ? linea.debe : lado === "haber" ? linea.haber : "0.00";
      const movimiento =
        lado === "debe" ? "Se debita" : lado === "haber" ? "Se acredita" : "No registra movimiento";
      const concepto = linea.concepto?.trim();
      return {
        cuentaId: linea.cuentaId,
        lado,
        explicacion: `${movimiento} ${linea.nombre} por $${importe}.${concepto ? ` ${concepto}` : ""}`,
      };
    }),
    esquemaT: { debe, haber },
  };
}
