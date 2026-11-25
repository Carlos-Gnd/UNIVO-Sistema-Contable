import {
  crearTerceroSchema,
  type FilaTerceroImportacion,
  type ProblemaImportacion,
  type ReporteImportacionTerceros,
  type TerceroVista,
} from "@contable/shared";
import type { Plantilla } from "../../importacion/domain/plantillas.js";
import { normalizar, type HojaLeida } from "../../importacion/domain/validacion.js";

/** Plantilla de clientes y proveedores (HU-58); la lectura reutiliza el lector de la importación (HU-17). */
export const PLANTILLA_TERCEROS: Plantilla = {
  hoja: "Clientes y proveedores",
  archivo: "plantilla-clientes-proveedores.xlsx",
  columnas: [
    { clave: "nombre", titulo: "Nombre", ancho: 40, ayuda: "Nombre o razón social, hasta 200 caracteres." },
    {
      clave: "nit",
      titulo: "NIT",
      ancho: 20,
      ayuda: "NIT con formato 0000-000000-000-0 o DUI 00000000-0; se valida el dígito verificador.",
    },
    {
      clave: "nrc",
      titulo: "NRC",
      ancho: 14,
      ayuda: "Formato 000000-0. Obligatorio para documentos de crédito fiscal; puede quedar vacío.",
    },
    {
      clave: "actividad",
      titulo: "Actividad económica",
      ancho: 32,
      ayuda: "Hasta 200 caracteres. Opcional.",
    },
    {
      clave: "clasificacion",
      titulo: "Clasificación",
      ancho: 24,
      ayuda: "Gran contribuyente, Mediano contribuyente u Otro contribuyente. Vacío equivale a Otro.",
    },
    { clave: "direccion", titulo: "Dirección", ancho: 36, ayuda: "Hasta 300 caracteres. Opcional." },
    { clave: "telefono", titulo: "Teléfono", ancho: 16, ayuda: "Hasta 20 caracteres. Opcional." },
    { clave: "correo", titulo: "Correo", ancho: 28, ayuda: "Correo electrónico válido. Opcional." },
    { clave: "tipo", titulo: "Tipo", ancho: 14, ayuda: "Cliente, Proveedor o Ambos." },
    {
      clave: "dias",
      titulo: "Días de crédito",
      ancho: 16,
      ayuda: "Entero de 0 a 365; 0 si es de contado. Vacío equivale a 0.",
    },
  ],
};

const CLASIFICACIONES: Record<string, FilaTerceroImportacion["clasificacion"]> = {
  "gran contribuyente": "grande",
  grande: "grande",
  "mediano contribuyente": "mediano",
  mediano: "mediano",
  "otro contribuyente": "otro",
  otro: "otro",
};

const TIPOS: Record<string, { esCliente: boolean; esProveedor: boolean }> = {
  cliente: { esCliente: true, esProveedor: false },
  proveedor: { esCliente: false, esProveedor: true },
  ambos: { esCliente: true, esProveedor: true },
};

const COLUMNA_DE_CAMPO: Record<string, string> = {
  nombre: "Nombre",
  nit: "NIT",
  nrc: "NRC",
  actividadEconomica: "Actividad económica",
  clasificacion: "Clasificación",
  direccion: "Dirección",
  telefono: "Teléfono",
  correo: "Correo",
  esCliente: "Tipo",
  esProveedor: "Tipo",
  diasCredito: "Días de crédito",
};

/**
 * Valida las filas leídas del Excel con el mismo esquema del alta (NIT y NRC con dígito verificador), y que
 * ni el NIT ni el NRC se repitan en el archivo ni con los terceros que la empresa ya tiene.
 */
export function validarTerceros(
  hoja: HojaLeida,
  existentes: readonly Pick<TerceroVista, "nit" | "nrc">[],
  maximoFilas: number,
): ReporteImportacionTerceros {
  const errores: ProblemaImportacion[] = [];
  const filas: FilaTerceroImportacion[] = [];
  const problema = (fila: number | null, columna: string | null, mensaje: string) =>
    errores.push({ fila, columna, mensaje });
  const reporte = (): ReporteImportacionTerceros => ({
    valido: errores.length === 0,
    filasLeidas: hoja.filas.length,
    errores,
    advertencias: [],
    filas: errores.length === 0 ? filas : [],
  });

  for (const falta of hoja.columnasFaltantes) problema(1, falta, `Falta la columna «${falta}» en la fila 1.`);
  if (hoja.excedeMaximo) problema(null, null, `El archivo tiene más de ${maximoFilas} filas con datos.`);
  if (hoja.filas.length === 0 && errores.length === 0)
    problema(null, null, "El archivo no tiene filas con datos.");
  if (errores.length > 0) return reporte();

  const nitsUsados = new Map<string, number | null>(existentes.map((t) => [t.nit, null]));
  const nrcsUsados = new Map<string, number | null>(
    existentes.flatMap((t) => (t.nrc ? [[t.nrc, null] as const] : [])),
  );
  const dondeEsta = (fila: number | null | undefined) => (fila ? `en la fila ${fila}` : "en la empresa");

  for (const { fila, valores } of hoja.filas) {
    const v = (clave: string) => (valores[clave] ?? "").trim();
    const antes = errores.length;

    const tipo = TIPOS[normalizar(v("tipo"))];
    if (!tipo) problema(fila, "Tipo", "Escribe «Cliente», «Proveedor» o «Ambos».");
    let clasificacion: FilaTerceroImportacion["clasificacion"] = "otro";
    if (v("clasificacion")) {
      const c = CLASIFICACIONES[normalizar(v("clasificacion"))];
      if (c) clasificacion = c;
      else
        problema(
          fila,
          "Clasificación",
          "Usa «Gran contribuyente», «Mediano contribuyente» u «Otro contribuyente».",
        );
    }
    if (v("dias") && !/^\d+$/.test(v("dias"))) {
      problema(fila, "Días de crédito", "Los días de crédito deben ser un número entero.");
    }

    const r = crearTerceroSchema.safeParse({
      nombre: v("nombre"),
      nit: v("nit"),
      nrc: v("nrc"),
      actividadEconomica: v("actividad"),
      clasificacion,
      direccion: v("direccion"),
      telefono: v("telefono"),
      correo: v("correo"),
      esCliente: tipo?.esCliente ?? true,
      esProveedor: tipo?.esProveedor ?? false,
      diasCredito: v("dias") === "" ? 0 : Number(v("dias")),
    });
    if (!r.success) {
      for (const issue of r.error.issues) {
        const columna = COLUMNA_DE_CAMPO[String(issue.path[0])] ?? null;
        // El «tipo» ya se avisó arriba; evita repetir el aviso del esquema
        if (columna === "Tipo" && !tipo) continue;
        if (columna === "Días de crédito" && v("dias") && !/^\d+$/.test(v("dias"))) continue;
        problema(fila, columna, issue.message);
      }
      continue;
    }

    const d = r.data;
    const usados: [Map<string, number | null>, string, string][] = [[nitsUsados, d.nit, "NIT"]];
    if (d.nrc) usados.push([nrcsUsados, d.nrc, "NRC"]);
    for (const [mapa, valor, nombre] of usados) {
      if (mapa.has(valor))
        problema(fila, nombre, `El ${nombre} ${valor} ya existe ${dondeEsta(mapa.get(valor))}.`);
    }
    // Solo las filas sin errores reservan su NIT y NRC, para no marcar como repetidas a las que sí están bien
    if (errores.length === antes) {
      nitsUsados.set(d.nit, fila);
      if (d.nrc) nrcsUsados.set(d.nrc, fila);
    }

    if (errores.length === antes && tipo) {
      filas.push({
        fila,
        nombre: d.nombre,
        nit: d.nit,
        nrc: d.nrc ?? null,
        actividadEconomica: d.actividadEconomica ?? null,
        clasificacion: d.clasificacion,
        direccion: d.direccion ?? null,
        telefono: d.telefono ?? null,
        correo: d.correo ?? null,
        esCliente: d.esCliente,
        esProveedor: d.esProveedor,
        diasCredito: d.diasCredito,
      });
    }
  }
  return reporte();
}
