import { api } from "@/lib/api";

/** Contrato publicado por el endpoint S4-T25. */
export interface SupuestosProyeccion {
  meses: number;
  crecimientoVentasMensual: number;
  crecimientoGastosMensual: number;
}

export type MetodoProyeccion = "promedio-movil" | "regresion" | "holt-winters";

export interface ValorProyectado {
  estimado: string;
  minimo: string;
  maximo: string;
}

export interface PeriodoProyectado {
  mes: string;
  ventas: ValorProyectado;
  gastos: ValorProyectado;
  utilidad: ValorProyectado;
  flujoEfectivo: ValorProyectado;
  iva: ValorProyectado;
}

export interface ProyeccionFinanciera {
  calculadaConDatosHasta: string;
  metodo: MetodoProyeccion;
  periodos: PeriodoProyectado[];
}

/** Adaptador único para el endpoint de proyecciones financieras S4-T25. */
export function solicitarProyeccion(empresaId: string, supuestos: SupuestosProyeccion) {
  return api<ProyeccionFinanciera>(`/empresas/${encodeURIComponent(empresaId)}/estados/proyecciones`, {
    metodo: "POST",
    cuerpo: supuestos,
  });
}
