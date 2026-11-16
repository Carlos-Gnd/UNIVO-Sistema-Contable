import type { Naturaleza, TipoCuenta } from "@contable/shared";

/** Forma de una cuenta del catálogo que devuelve GET /empresas/:empresaId/cuentas. */
export interface CuentaCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  naturaleza: Naturaleza;
  tipo: TipoCuenta;
  cuentaPadreId: string | null;
  activa: boolean;
}

export const LONGITUDES_CODIGO_CUENTA = [1, 2, 4, 6, 8, 10] as const;

export const ETIQUETAS_NATURALEZA: Record<Naturaleza, string> = {
  deudora: "Deudora",
  acreedora: "Acreedora",
};

export const ETIQUETAS_TIPO_CUENTA: Record<TipoCuenta, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  patrimonio: "Patrimonio",
  costos_gastos: "Costos y gastos",
  ingresos: "Ingresos",
  liquidadora: "Liquidadora",
  orden: "Orden",
};
