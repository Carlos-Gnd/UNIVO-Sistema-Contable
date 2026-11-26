import type { EstadoCambiosPatrimonio } from "@contable/shared";
import { formatearFecha } from "@/lib/formato";
import type { DocumentoEstado } from "../exportacion/documento-estado";
import { TEXTOS_ESTADOS_ADICIONALES as T } from "./textos";

/** El estado de cambios en el patrimonio como documento exportable: una columna por rubro y el total. */
export function documentoCambiosPatrimonio(estado: EstadoCambiosPatrimonio): DocumentoEstado {
  const P = T.patrimonio;
  return {
    titulo: estado.titulo,
    periodo: P.periodo(formatearFecha(estado.desde), formatearFecha(estado.hasta)),
    columnas: [
      ...estado.columnas.map((c) => ({ titulo: c.titulo, tipo: "dinero" as const })),
      { titulo: P.total, tipo: "dinero" as const },
    ],
    filas: estado.renglones.map((r) => ({
      id: r.id,
      texto: r.concepto,
      valores: [...r.valores, r.total],
      tipo:
        r.id === "saldo-inicial" || r.id === "saldo-final" ? ("resultado" as const) : ("renglon" as const),
    })),
    nombreHoja: estado.titulo.slice(0, 31),
    nombreArchivo: `${P.nombreArchivo}-${estado.desde}-${estado.hasta}`,
  };
}
