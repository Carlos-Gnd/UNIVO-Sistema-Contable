import {
  crearProductoSchema,
  type CategoriaProducto,
  type FilaProductoImportacion,
  type ProblemaImportacion,
  type ReporteImportacionProductos,
} from "@contable/shared";
import { normalizar, type HojaLeida } from "../../importacion/domain/validacion.js";
import type { Plantilla } from "../../importacion/domain/plantillas.js";

export const PLANTILLA_PRODUCTOS: Plantilla = {
  hoja: "Productos",
  archivo: "plantilla-productos.xlsx",
  columnas: [
    {
      clave: "codigo",
      titulo: "Código",
      ancho: 16,
      ayuda: "Único por empresa. Letras, números, punto, guion y guion bajo.",
    },
    { clave: "nombre", titulo: "Nombre", ancho: 42, ayuda: "Nombre del producto, hasta 150 caracteres." },
    {
      clave: "categoria",
      titulo: "Categoría",
      ancho: 24,
      ayuda: "Nombre de una categoría activa que ya exista. Puede quedar vacío.",
    },
    {
      clave: "unidad",
      titulo: "Unidad de medida",
      ancho: 18,
      ayuda: "Por ejemplo: unidad, caja, libra. Puede quedar vacío.",
    },
    {
      clave: "precio",
      titulo: "Precio de venta",
      ancho: 16,
      ayuda: "Dólares con dos decimales como máximo. Vacío equivale a 0.00.",
    },
    {
      clave: "minimo",
      titulo: "Existencia mínima",
      ancho: 18,
      ayuda: "Cantidad con hasta 4 decimales. Vacío equivale a 0.",
    },
    {
      clave: "metodo",
      titulo: "Método de valuación",
      ancho: 22,
      ayuda: "Promedio ponderado o PEPS. Vacío usa el método de la empresa.",
    },
    { clave: "series", titulo: "Controla series", ancho: 16, ayuda: "Sí o No. Vacío equivale a No." },
  ],
};

const METODOS: Record<string, "promedio_ponderado" | "peps"> = {
  "promedio ponderado": "promedio_ponderado",
  promedio: "promedio_ponderado",
  peps: "peps",
};

const COLUMNA_DE_CAMPO: Record<string, string> = {
  codigo: "Código",
  nombre: "Nombre",
  categoriaId: "Categoría",
  unidadMedida: "Unidad de medida",
  precioVenta: "Precio de venta",
  existenciaMinima: "Existencia mínima",
  metodoValuacion: "Método de valuación",
  controlaSeries: "Controla series",
};

/** Valida las filas leídas del Excel contra el esquema de producto, las categorías y los códigos existentes. */
export function validarProductos(
  hoja: HojaLeida,
  categorias: readonly CategoriaProducto[],
  codigosExistentes: ReadonlySet<string>,
  maximoFilas: number,
): ReporteImportacionProductos {
  const errores: ProblemaImportacion[] = [];
  const advertencias: ProblemaImportacion[] = [];
  const filas: FilaProductoImportacion[] = [];
  const problema = (fila: number | null, columna: string | null, mensaje: string) =>
    errores.push({ fila, columna, mensaje });

  for (const falta of hoja.columnasFaltantes) problema(1, falta, `Falta la columna «${falta}» en la fila 1.`);
  if (hoja.excedeMaximo) problema(null, null, `El archivo tiene más de ${maximoFilas} filas con datos.`);
  if (hoja.filas.length === 0 && errores.length === 0)
    problema(null, null, "El archivo no tiene filas con datos.");
  if (errores.length > 0)
    return { valido: false, filasLeidas: hoja.filas.length, errores, advertencias, filas: [] };

  const porNombre = new Map(categorias.filter((c) => c.activa).map((c) => [normalizar(c.nombre), c.id]));
  const vistos = new Map<string, number>();

  for (const { fila, valores } of hoja.filas) {
    const v = (clave: string) => (valores[clave] ?? "").trim();
    const antes = errores.length;

    let categoriaId: string | null = null;
    if (v("categoria")) {
      categoriaId = porNombre.get(normalizar(v("categoria"))) ?? null;
      if (!categoriaId)
        problema(fila, "Categoría", `La categoría «${v("categoria")}» no existe o está inactiva.`);
    }
    let metodo: "promedio_ponderado" | "peps" | null = null;
    if (v("metodo")) {
      metodo = METODOS[normalizar(v("metodo"))] ?? null;
      if (!metodo) problema(fila, "Método de valuación", "Usa «Promedio ponderado» o «PEPS».");
    }
    let controlaSeries = false;
    if (v("series")) {
      const texto = normalizar(v("series"));
      if (["si", "s", "true", "1"].includes(texto)) controlaSeries = true;
      else if (!["no", "n", "false", "0"].includes(texto))
        problema(fila, "Controla series", "Escribe «Sí» o «No».");
    }

    const resultado = crearProductoSchema.safeParse({
      codigo: v("codigo"),
      nombre: v("nombre"),
      categoriaId: categoriaId ?? undefined,
      unidadMedida: v("unidad") || undefined,
      precioVenta: v("precio") || "0.00",
      existenciaMinima: v("minimo") || "0",
      controlaSeries,
      metodoValuacion: metodo ?? undefined,
    });
    if (!resultado.success) {
      for (const issue of resultado.error.issues) {
        problema(fila, COLUMNA_DE_CAMPO[String(issue.path[0])] ?? null, issue.message);
      }
    } else {
      const codigo = resultado.data.codigo.toLowerCase();
      if (vistos.has(codigo))
        problema(fila, "Código", `El código se repite en la fila ${vistos.get(codigo)}.`);
      else if (codigosExistentes.has(codigo))
        problema(fila, "Código", "Ya existe un producto con este código.");
      vistos.set(codigo, fila);
      if (errores.length === antes) {
        filas.push({
          fila,
          codigo: resultado.data.codigo,
          nombre: resultado.data.nombre,
          categoriaId,
          unidadMedida: resultado.data.unidadMedida ?? null,
          precioVenta: resultado.data.precioVenta,
          existenciaMinima: resultado.data.existenciaMinima,
          controlaSeries,
          metodoValuacion: metodo,
        });
      }
    }
  }
  return {
    valido: errores.length === 0,
    filasLeidas: hoja.filas.length,
    errores,
    advertencias,
    filas: errores.length === 0 ? filas : [],
  };
}
