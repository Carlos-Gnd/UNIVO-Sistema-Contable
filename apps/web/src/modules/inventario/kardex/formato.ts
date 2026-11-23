import { formatearDinero } from "@/lib/formato";

/** Monto de una columna de libro: dos decimales con miles y sin símbolo. */
export const monto = (valor: string) => formatearDinero(valor, { simbolo: false });

/** Unidades sin ceros sobrantes: "8", "2.5". Solo para mostrar; las cantidades viajan como texto exacto. */
export const unidades = (valor: string) =>
  Number(valor).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

/** Costo por unidad con cuatro decimales como máximo y dos como mínimo: "590.00", "595.7143". */
export const costoUnitario = (valor: string) =>
  Number(valor).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
