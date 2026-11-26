import type { NotasEstados } from "@contable/shared";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import type { DocumentoEstado, FilaDocumento } from "../exportacion/documento-estado";
import { TEXTOS_NOTAS as T } from "./textos";

/**
 * Las notas como documento exportable: por cada nota su título, el texto vigente, las cifras que llena el
 * sistema y el detalle. Una sola columna de cifras ya formateadas, para que sirva igual en PDF y en Excel.
 */
export function documentoNotas(notas: NotasEstados): DocumentoEstado {
  const filas: FilaDocumento[] = [];
  for (const n of notas.notas) {
    const id = `nota-${n.numero}`;
    filas.push({ id, texto: T.notaNumero(n.numero, n.titulo), tipo: "seccion" });
    filas.push({ id: `${id}-texto`, texto: n.texto, tipo: "parrafo" });
    for (const c of n.campos) {
      filas.push({
        id: `${id}-${c.nombre}`,
        texto: c.nombre,
        valores: [c.tipo === "dinero" ? formatearDinero(c.valor, { simbolo: false }) : c.valor],
        tipo: "renglon",
      });
    }
    if (n.tabla) {
      const { columnas, renglones } = n.tabla;
      for (const r of renglones) {
        // Una fila por cifra: así una tabla de varias columnas cabe en la columna única del documento
        r.valores.forEach((valor, i) => {
          const rotulo = columnas.length > 1 ? `${r.concepto} · ${columnas[i]}` : r.concepto;
          filas.push({
            id: `${id}-tabla-${filas.length}`,
            texto: rotulo,
            valores: [formatearDinero(valor, { simbolo: false })],
            tipo: r.total ? "total" : "renglon",
          });
        });
      }
    }
  }
  return {
    titulo: T.titulo,
    periodo: T.periodo(formatearFecha(notas.desde), formatearFecha(notas.hasta)),
    columnas: [{ titulo: T.columnaCifra, tipo: "texto" }],
    filas,
    nombreHoja: T.titulo.slice(0, 31),
    nombreArchivo: `${T.nombreArchivo}-${notas.desde}-${notas.hasta}`,
  };
}
