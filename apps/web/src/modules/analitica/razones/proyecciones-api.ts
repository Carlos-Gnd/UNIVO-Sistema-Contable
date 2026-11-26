import { api } from "@/lib/api";

/** Contrato provisional de S4-T25; debe ajustarse al contrato publicado por el backend. */
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

/** Endpoint y cuerpo esperados de S4-T25; mantener este adaptador como único punto de integración. */
export function solicitarProyeccion(empresaId: string, supuestos: SupuestosProyeccion) {
  return api<ProyeccionFinanciera>(`/empresas/${encodeURIComponent(empresaId)}/estados/proyecciones`, {
    metodo: "POST",
    cuerpo: supuestos,
  });
}
