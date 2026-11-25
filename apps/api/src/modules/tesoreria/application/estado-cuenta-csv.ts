import { createHash } from "node:crypto";
import { Dinero } from "@contable/shared";
import type { LineaEstadoCuentaEntrada } from "../domain/conciliacion-bancaria.js";

export type FilaCsvEstadoCuenta = LineaEstadoCuentaEntrada;
export interface ErrorFilaCsv {
  numeroFila: number;
  fecha: string | null;
  referencia: string;
  descripcion: string;
  monto: string | null;
  huella: string;
  detalle: string;
}

export class ArchivoEstadoCuentaInvalidoError extends Error {}

function separarCsv(texto: string, separador: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i]!;
    if (caracter === '"') {
      if (entreComillas && texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (caracter === separador && !entreComillas) {
      fila.push(campo);
      campo = "";
    } else if ((caracter === "\n" || caracter === "\r") && !entreComillas) {
      if (caracter === "\r" && texto[i + 1] === "\n") i += 1;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else {
      campo += caracter;
    }
  }
  if (entreComillas) throw new ArchivoEstadoCuentaInvalidoError("El CSV contiene comillas sin cerrar.");
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

function huella(fecha: string, referencia: string, monto: string): string {
  return createHash("sha256")
    .update(`${fecha.trim()}|${referencia.trim().toLocaleLowerCase("es-SV")}|${monto}`)
    .digest("hex");
}

function esFechaIso(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaUtc = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(fechaUtc.getTime()) && fechaUtc.toISOString().slice(0, 10) === fecha;
}

/** Acepta CSV UTF-8 separado por coma o punto y coma con columnas fecha, referencia, descripcion y monto. */
export function parsearEstadoCuentaCsv(buffer: Buffer): {
  filas: FilaCsvEstadoCuenta[];
  errores: ErrorFilaCsv[];
} {
  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
    throw new ArchivoEstadoCuentaInvalidoError("El archivo CSV está vacío o supera 5 MB.");
  }
  const texto = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (texto.includes("\u0000"))
    throw new ArchivoEstadoCuentaInvalidoError("El archivo no es un CSV de texto UTF-8.");
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? "";
  const separador =
    (primeraLinea.match(/;/g)?.length ?? 0) > (primeraLinea.match(/,/g)?.length ?? 0) ? ";" : ",";
  const matriz = separarCsv(texto, separador);
  const encabezados = matriz.shift()?.map((valor) => valor.trim().toLocaleLowerCase("es-SV")) ?? [];
  const indices = ["fecha", "referencia", "descripcion", "monto"].map((nombre) =>
    encabezados.indexOf(nombre),
  );
  if (indices.some((indice) => indice < 0)) {
    throw new ArchivoEstadoCuentaInvalidoError(
      "El CSV debe incluir las columnas fecha, referencia, descripcion y monto.",
    );
  }
  if (matriz.length > 5000)
    throw new ArchivoEstadoCuentaInvalidoError("El CSV no puede superar 5,000 filas.");

  const filas: FilaCsvEstadoCuenta[] = [];
  const errores: ErrorFilaCsv[] = [];
  const huellas = new Set<string>();
  matriz.forEach((columnas, indice) => {
    const numeroFila = indice + 2;
    if (columnas.every((valor) => valor.trim() === "")) return;
    const [iFecha, iReferencia, iDescripcion, iMonto] = indices;
    const fechaOriginal = columnas[iFecha!]?.trim() ?? "";
    const referencia = columnas[iReferencia!]?.trim() ?? "";
    const descripcion = columnas[iDescripcion!]?.trim() ?? "";
    const montoOriginal = columnas[iMonto!]?.trim() ?? "";
    const erroresFila: string[] = [];
    if (columnas.length !== encabezados.length)
      erroresFila.push("La fila tiene una cantidad distinta de columnas.");
    const fechaValida = esFechaIso(fechaOriginal);
    if (!fechaValida) erroresFila.push("La fecha debe tener formato AAAA-MM-DD.");
    if (!referencia || referencia.length > 60)
      erroresFila.push("La referencia es obligatoria y admite hasta 60 caracteres.");
    if (!descripcion || descripcion.length > 200)
      erroresFila.push("La descripción es obligatoria y admite hasta 200 caracteres.");
    if (!/^-?\d{1,12}(?:\.\d{1,2})?$/.test(montoOriginal))
      erroresFila.push("El monto debe ser decimal, con punto y hasta dos decimales.");
    let monto: string | null = null;
    if (/^-?\d{1,12}(?:\.\d{1,2})?$/.test(montoOriginal)) {
      try {
        monto = Dinero.de(montoOriginal).aTexto();
        if (Dinero.de(monto).esCero()) erroresFila.push("El monto no puede ser cero.");
      } catch {
        erroresFila.push("El monto está fuera del rango permitido.");
      }
    }
    const hash = huella(fechaOriginal, referencia, monto ?? montoOriginal);
    if (erroresFila.length) {
      errores.push({
        numeroFila,
        fecha: fechaValida ? fechaOriginal : null,
        referencia,
        descripcion,
        monto,
        huella: hash,
        detalle: erroresFila.join(" "),
      });
      return;
    }
    if (huellas.has(hash)) {
      errores.push({
        numeroFila,
        fecha: fechaOriginal,
        referencia,
        descripcion,
        monto,
        huella: hash,
        detalle: "La fila está duplicada dentro del archivo.",
      });
      return;
    }
    huellas.add(hash);
    filas.push({ numeroFila, fecha: fechaOriginal, referencia, descripcion, monto: monto!, huella: hash });
  });
  return { filas, errores };
}
