import {
  Dinero,
  LONGITUDES_CODIGO,
  MAXIMO_FILAS_IMPORTACION,
  type FilaCatalogo,
  type FilaSaldoInicial,
  type Naturaleza,
  type ProblemaImportacion,
  type ReporteCatalogo,
  type ReporteSaldosIniciales,
  type TipoCuenta,
} from "@contable/shared";
import { NATURALEZAS, PLANTILLAS, TIPOS_CUENTA, type CuentaExistente, type Plantilla } from "./plantillas.js";

/** Fila de datos de la hoja: valores de texto por clave de columna ("" si la celda está vacía). */
export interface FilaLeida {
  fila: number;
  valores: Record<string, string>;
}

/** Contenido de la hoja tal como se leyó del archivo, antes de validar. */
export interface HojaLeida {
  /** Títulos de la plantilla que no se encontraron en la fila 1 */
  columnasFaltantes: string[];
  filas: FilaLeida[];
  /** Tenía más filas con datos que MAXIMO_FILAS_IMPORTACION */
  excedeMaximo: boolean;
}

/**
 * Minúsculas, sin tildes, con "_" como espacio y espacios simples: así "Costos y Gastos",
 * "costos y gastos" y "COSTOS_GASTOS" se comparan igual.
 */
export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim();

/** Busca la clave cuyo nombre visible, o la clave misma, coincide con el texto. */
function buscarOpcion<K extends string>(opciones: Record<K, string>, texto: string): K | undefined {
  const buscado = normalizar(texto);
  return (Object.keys(opciones) as K[]).find(
    (clave) => normalizar(opciones[clave]) === buscado || normalizar(clave) === buscado,
  );
}

const longitudesValidas: readonly number[] = LONGITUDES_CODIGO;

/** Código del padre según el código de la cuenta, igual que lo calcula la base; null si es de nivel 1. */
export function codigoPadre(codigo: string): string | null {
  const nivel = longitudesValidas.indexOf(codigo.length);
  return nivel > 0 ? codigo.slice(0, longitudesValidas[nivel - 1]) : null;
}

/** Errores de toda la hoja (columnas faltantes, sin filas, demasiadas filas), o una lista vacía. */
function problemasDeHoja(hoja: HojaLeida, plantilla: Plantilla): ProblemaImportacion[] {
  const general = (mensaje: string): ProblemaImportacion => ({ fila: null, columna: null, mensaje });
  if (hoja.columnasFaltantes.length > 0) {
    return [
      general(
        `Faltan las columnas ${hoja.columnasFaltantes.join(", ")} en la fila 1 de la hoja «${plantilla.hoja}». ` +
          "Use la plantilla descargada sin cambiar los títulos.",
      ),
    ];
  }
  if (hoja.excedeMaximo) {
    return [general(`El archivo tiene más de ${MAXIMO_FILAS_IMPORTACION} filas; divídalo en varios.`)];
  }
  if (hoja.filas.length === 0) return [general("El archivo no tiene filas con datos para importar.")];
  return [];
}

/** Lleva los errores de una hoja y arma el resultado común de los reportes. */
class Revision {
  readonly errores: ProblemaImportacion[] = [];
  readonly advertencias: ProblemaImportacion[] = [];

  error(fila: number | null, columna: string | null, mensaje: string) {
    this.errores.push({ fila, columna, mensaje });
  }

  advertencia(fila: number, columna: string | null, mensaje: string) {
    this.advertencias.push({ fila, columna, mensaje });
  }

  reporte<T>(hoja: HojaLeida, filas: T[]) {
    const valido = this.errores.length === 0;
    return {
      valido,
      filasLeidas: hoja.filas.length,
      errores: this.errores,
      advertencias: this.advertencias,
      filas: valido ? filas : [],
    };
  }
}

/**
 * Valida la hoja del catálogo contra el catálogo actual de la empresa (S1-T69). Cada cuenta nueva debe
 * tener su cuenta padre en el archivo o en el catálogo, y no puede repetir un código existente.
 */
export function validarCatalogo(hoja: HojaLeida, existentes: readonly CuentaExistente[]): ReporteCatalogo {
  const r = new Revision();
  const plantilla = PLANTILLAS.catalogo;
  for (const p of problemasDeHoja(hoja, plantilla)) r.error(p.fila, p.columna, p.mensaje);
  if (r.errores.length > 0) return { tipo: "catalogo", ...r.reporte(hoja, []) };

  const actuales = new Map(existentes.map((c) => [c.codigo, c]));
  const filaDeCodigo = new Map<string, number>();
  const leidas: FilaCatalogo[] = [];

  for (const { fila, valores } of hoja.filas) {
    const erroresAntes = r.errores.length;
    const codigo = valores["codigo"] ?? "";
    const nombre = valores["nombre"] ?? "";

    if (codigo === "") r.error(fila, "Código", "Falta el código.");
    else if (!/^\d+$/.test(codigo))
      r.error(fila, "Código", `El código «${codigo}» solo debe llevar dígitos.`);
    else if (!longitudesValidas.includes(codigo.length)) {
      r.error(fila, "Código", `El código ${codigo} debe tener 1, 2, 4, 6, 8 o 10 dígitos.`);
    } else if (filaDeCodigo.has(codigo)) {
      r.error(fila, "Código", `El código ${codigo} ya aparece en la fila ${filaDeCodigo.get(codigo)}.`);
    } else if (actuales.has(codigo)) {
      r.error(fila, "Código", `La cuenta ${codigo} ya existe en el catálogo de la empresa.`);
    }

    if (nombre === "") r.error(fila, "Nombre", "Falta el nombre de la cuenta.");
    else if (nombre.length > 200) r.error(fila, "Nombre", "El nombre admite como máximo 200 caracteres.");

    const naturaleza = buscarOpcion<Naturaleza>(NATURALEZAS, valores["naturaleza"] ?? "");
    if (!naturaleza) {
      r.error(fila, "Naturaleza", `Naturaleza inválida: use ${Object.values(NATURALEZAS).join(" o ")}.`);
    }
    const tipo = buscarOpcion<TipoCuenta>(TIPOS_CUENTA, valores["tipo"] ?? "");
    if (!tipo) r.error(fila, "Tipo", `Tipo inválido: use ${Object.values(TIPOS_CUENTA).join(", ")}.`);

    if (/^\d+$/.test(codigo) && !filaDeCodigo.has(codigo)) filaDeCodigo.set(codigo, fila);
    if (r.errores.length === erroresAntes && naturaleza && tipo) {
      leidas.push({ fila, codigo, nombre, naturaleza, tipo });
    }
  }

  // La jerarquía se revisa al final porque el padre puede venir en una fila posterior
  const nuevas = new Set(leidas.map((c) => c.codigo));
  for (const cuenta of leidas) {
    const padre = codigoPadre(cuenta.codigo);
    if (padre === null) continue;
    const existente = actuales.get(padre);
    if (!existente && !nuevas.has(padre) && !filaDeCodigo.has(padre)) {
      r.error(
        cuenta.fila,
        "Código",
        `No existe la cuenta padre ${padre} ni en el archivo ni en el catálogo.`,
      );
    } else if (existente?.tieneMovimientos) {
      r.error(
        cuenta.fila,
        "Código",
        `La cuenta ${padre} tiene movimientos; no se le pueden crear subcuentas.`,
      );
    }
  }

  r.errores.sort((a, b) => (a.fila ?? 0) - (b.fila ?? 0));
  return { tipo: "catalogo", ...r.reporte(hoja, leidas) };
}

/** Monto de una celda como Dinero, o el motivo por el que no es válido. Vacío es cero. */
function leerMonto(texto: string): Dinero | string {
  let t = texto.replace(/[$\s]/g, "");
  if (t === "") return Dinero.cero();
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, ""); // separador de miles: 1,250.50
  if (/^-\d/.test(t)) return "El monto no puede ser negativo.";
  if (!/^\d+(\.\d+)?$/.test(t)) return `Monto inválido: «${texto}».`;
  if (/\.\d{3,}$/.test(t)) return "El monto admite como máximo dos decimales.";
  try {
    return Dinero.de(t);
  } catch {
    return "El monto excede el máximo permitido.";
  }
}

/**
 * Valida la hoja de saldos iniciales contra el catálogo de la empresa (S1-T69). Las filas sin monto se
 * ignoran, para que la plantilla pueda traer todas las cuentas. El cuadre se informa en el resumen; la
 * partida de apertura se genera como borrador (S1-T70), que puede quedar descuadrado.
 */
export function validarSaldos(
  hoja: HojaLeida,
  existentes: readonly CuentaExistente[],
): ReporteSaldosIniciales {
  const r = new Revision();
  const plantilla = PLANTILLAS["saldos-iniciales"];
  for (const p of problemasDeHoja(hoja, plantilla)) r.error(p.fila, p.columna, p.mensaje);

  const cuentas = new Map(existentes.map((c) => [c.codigo, c]));
  const filaDeCodigo = new Map<string, number>();
  const leidas: FilaSaldoInicial[] = [];
  let conMonto = 0;

  for (const { fila, valores } of r.errores.length > 0 ? [] : hoja.filas) {
    const debe = leerMonto(valores["debe"] ?? "");
    const haber = leerMonto(valores["haber"] ?? "");
    if (typeof debe === "string") r.error(fila, "Debe", debe);
    if (typeof haber === "string") r.error(fila, "Haber", haber);
    if (typeof debe === "string" || typeof haber === "string") continue;
    if (debe.esCero() && haber.esCero()) continue; // cuenta sin saldo
    conMonto++;

    if (!debe.esCero() && !haber.esCero()) {
      r.error(fila, "Haber", "Una fila no puede tener saldo en debe y en haber a la vez.");
      continue;
    }
    const codigo = valores["codigo"] ?? "";
    const cuenta = cuentas.get(codigo);
    if (codigo === "") {
      r.error(fila, "Código", "Falta el código de la cuenta.");
    } else if (filaDeCodigo.has(codigo)) {
      r.error(fila, "Código", `La cuenta ${codigo} ya tiene saldo en la fila ${filaDeCodigo.get(codigo)}.`);
    } else if (!cuenta) {
      r.error(fila, "Código", `La cuenta ${codigo} no existe en el catálogo de la empresa.`);
    } else if (!cuenta.imputable) {
      r.error(
        fila,
        "Código",
        `La cuenta ${codigo} no es de último nivel; registre el saldo en sus subcuentas.`,
      );
    } else if (!cuenta.activa) {
      r.error(fila, "Código", `La cuenta ${codigo} está inactiva.`);
    } else {
      const contraria = cuenta.naturaleza === "deudora" ? !haber.esCero() : !debe.esCero();
      if (contraria) {
        r.advertencia(
          fila,
          cuenta.naturaleza === "deudora" ? "Haber" : "Debe",
          `El saldo de ${codigo} ${cuenta.nombre} es contrario a su naturaleza ${cuenta.naturaleza}.`,
        );
      }
      leidas.push({ fila, cuentaId: cuenta.id, codigo, debe: debe.aTexto(), haber: haber.aTexto() });
    }
    if (codigo !== "" && !filaDeCodigo.has(codigo)) filaDeCodigo.set(codigo, fila);
  }

  if (r.errores.length === 0 && conMonto === 0) {
    r.error(null, null, "El archivo no tiene saldos: escriba al menos un monto en debe o en haber.");
  }

  const totalDebe = Dinero.sumar(leidas.map((s) => s.debe));
  const totalHaber = Dinero.sumar(leidas.map((s) => s.haber));
  const cuadra = totalDebe.igualA(totalHaber);
  return {
    tipo: "saldos-iniciales",
    ...r.reporte(hoja, leidas),
    resumen: {
      totalDebe: totalDebe.aTexto(),
      totalHaber: totalHaber.aTexto(),
      diferencia: totalDebe.menos(totalHaber).abs().aTexto(),
      cuadra,
    },
  };
}
