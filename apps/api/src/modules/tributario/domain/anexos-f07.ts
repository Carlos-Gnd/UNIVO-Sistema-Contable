import type {
  AnexoF07,
  AnexosF07Vista,
  ErrorAnexoF07,
  IdAnexoF07,
  LibroCompras,
  LibroConsumidor,
  LibroContribuyentes,
} from "@contable/shared";

/** Columnas de cada anexo, en el orden del archivo. */
export const COLUMNAS_ANEXO_F07: Record<IdAnexoF07, string[]> = {
  compras: [
    "Fecha",
    "Tipo",
    "Documento",
    "NRC",
    "Proveedor",
    "Exentas",
    "No sujetas",
    "Gravadas",
    "Crédito fiscal",
    "IVA percibido",
    "IVA retenido",
    "Total",
  ],
  contribuyentes: [
    "Fecha",
    "Tipo",
    "Documento",
    "NRC",
    "Cliente",
    "Exentas",
    "No sujetas",
    "Gravadas",
    "Débito fiscal",
    "IVA percibido",
    "IVA retenido",
    "Total",
  ],
  consumidor: [
    "Fecha",
    "Del N.º",
    "Al N.º",
    "Documentos",
    "Exentas",
    "No sujetas",
    "Gravadas",
    "IVA incluido",
    "Exportaciones",
    "Total",
  ],
};

/** Código del tipo de documento en los anexos: CCF, factura y las notas de crédito (NCR) y de débito (NDB) de HU-61. */
const CODIGO_TIPO = { ccf: "CCF", factura: "FAC", nota_credito: "NCR", nota_debito: "NDB" } as const;

/** AAAA-MM-DD a dd/mm/aaaa, el formato de fecha de los archivos del portal. */
export function fechaDeAnexo(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Un texto del archivo no puede llevar el separador, comillas ni saltos de línea. */
export function textoDeAnexo(valor: string | null | undefined): string {
  return (valor ?? "")
    .replace(/[;"\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Renglon {
  referencia: string;
  /** Valores en el orden de las columnas */
  valores: string[];
  /** Columnas (por posición) que no pueden ir vacías */
  obligatorias: number[];
}

function armarAnexo(
  id: IdAnexoF07,
  nombre: string,
  archivo: string,
  total: string,
  renglones: Renglon[],
): AnexoF07 {
  const columnas = COLUMNAS_ANEXO_F07[id];
  const errores: ErrorAnexoF07[] = [];
  renglones.forEach((r, i) => {
    for (const c of r.obligatorias) {
      if (r.valores[c] !== "") continue;
      const columna = columnas[c] ?? "";
      errores.push({
        fila: i + 1,
        columna,
        referencia: r.referencia,
        mensaje: `Falta «${columna}» en ${r.referencia}.`,
      });
    }
  });
  const filas = renglones.map((r) => r.valores);
  return {
    id,
    nombre,
    archivo,
    columnas,
    filas,
    total,
    errores,
    csv: errores.length ? "" : filas.map((f) => f.join(";")).join("\r\n") + (filas.length ? "\r\n" : ""),
  };
}

/**
 * Anexos del F-07 (HU-51): los tres libros de IVA del período en el formato del portal, con punto y coma como
 * separador, punto decimal, fechas dd/mm/aaaa y sin encabezado. Un renglón con un campo obligatorio vacío
 * (número, NRC del CCF, nombre del tercero) deja el anexo con errores y sin CSV. Las notas de crédito salen con
 * signo negativo y las de débito con positivo, igual que en los libros. Los montos ya vienen como texto
 * exacto de los libros, así que el archivo suma lo mismo que ellos.
 */
export function armarAnexosF07(
  compras: LibroCompras,
  contribuyentes: LibroContribuyentes,
  consumidor: LibroConsumidor,
): AnexosF07Vista {
  return {
    desde: compras.desde,
    hasta: compras.hasta,
    anexos: [
      armarAnexo(
        "compras",
        "Anexo de compras",
        "anexo-compras",
        compras.totales.totalCompras,
        compras.filas.map((f) => ({
          referencia: `${CODIGO_TIPO[f.tipoDocumento]} ${f.numeroDocumento}`.trim(),
          valores: [
            fechaDeAnexo(f.fecha),
            CODIGO_TIPO[f.tipoDocumento],
            textoDeAnexo(f.numeroDocumento),
            textoDeAnexo(f.nrcProveedor),
            textoDeAnexo(f.proveedor),
            f.comprasExentas,
            f.comprasNoSujetas,
            f.comprasGravadas,
            f.creditoFiscal,
            f.ivaPercibido,
            f.ivaRetenido,
            f.totalCompras,
          ],
          // El CCF exige el NRC del proveedor; la factura puede venir de quien no es contribuyente
          obligatorias: f.tipoDocumento === "ccf" ? [0, 2, 3, 4] : [0, 2, 4],
        })),
      ),
      armarAnexo(
        "contribuyentes",
        "Anexo de ventas a contribuyentes",
        "anexo-ventas-contribuyentes",
        contribuyentes.totales.ventaTotal,
        contribuyentes.filas.map((f) => ({
          referencia: `${CODIGO_TIPO[f.tipoDocumento]} ${f.numeroDocumento}`.trim(),
          valores: [
            fechaDeAnexo(f.fecha),
            CODIGO_TIPO[f.tipoDocumento],
            textoDeAnexo(f.numeroDocumento),
            textoDeAnexo(f.nrcCliente),
            textoDeAnexo(f.cliente),
            f.ventasExentas,
            f.ventasNoSujetas,
            f.ventasGravadas,
            f.debitoFiscal,
            f.ivaPercibido,
            f.ivaRetenido,
            f.ventaTotal,
          ],
          obligatorias: [0, 2, 3, 4],
        })),
      ),
      armarAnexo(
        "consumidor",
        "Anexo de ventas a consumidor final",
        "anexo-ventas-consumidor",
        consumidor.totales.totalVentas,
        consumidor.filas.map((f) => ({
          referencia: `${f.del} a ${f.al} (${fechaDeAnexo(f.fecha)})`,
          valores: [
            fechaDeAnexo(f.fecha),
            textoDeAnexo(f.del),
            textoDeAnexo(f.al),
            String(f.documentos),
            f.ventasExentas,
            f.ventasNoSujetas,
            f.ventasGravadas,
            f.ivaIncluido,
            f.exportaciones,
            f.totalVentas,
          ],
          obligatorias: [0, 1, 2],
        })),
      ),
    ],
  };
}
