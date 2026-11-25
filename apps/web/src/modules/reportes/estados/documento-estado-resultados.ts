import type { EstadoResultados } from "@contable/shared";
import { formatearFecha } from "@/lib/formato";
import type { DocumentoEstado } from "../exportacion/documento-estado";
import { filasEstadoResultados } from "./filas-estado-resultados";
import { TEXTOS_ESTADO_RESULTADOS as T } from "./textos";

/** El estado de resultados como documento exportable (HU-39). */
export function documentoEstadoResultados(estado: EstadoResultados): DocumentoEstado {
  return {
    titulo: T.titulo,
    periodo: `Del ${formatearFecha(estado.desde)} al ${formatearFecha(estado.hasta)}`,
    columnas: [{ titulo: T.monto, tipo: "dinero" }],
    filas: filasEstadoResultados(estado).map((f) => ({
      id: f.id,
      texto: f.texto,
      tipo: f.tipo,
      ...(f.monto === undefined ? {} : { valores: [f.monto] }),
    })),
    nombreHoja: T.titulo,
    nombreArchivo: `estado-resultados-${estado.desde}-${estado.hasta}`,
  };
}
