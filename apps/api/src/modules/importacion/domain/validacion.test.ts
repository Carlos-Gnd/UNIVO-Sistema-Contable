import { describe, expect, it } from "vitest";
import type { CuentaExistente } from "./plantillas.js";
import { codigoPadre, normalizar, validarCatalogo, validarSaldos, type HojaLeida } from "./validacion.js";

const cuenta = (codigo: string, nombre: string, extra: Partial<CuentaExistente> = {}): CuentaExistente => ({
  id: `id-${codigo}`,
  codigo,
  nombre,
  naturaleza: codigo.startsWith("1") ? "deudora" : "acreedora",
  activa: true,
  imputable: codigo.length >= 4,
  tieneMovimientos: false,
  ...extra,
});

const CATALOGO: CuentaExistente[] = [
  cuenta("1", "Activo"),
  cuenta("11", "Activo corriente"),
  cuenta("1101", "Efectivo y equivalentes", { imputable: false }),
  cuenta("110101", "Caja general"),
  cuenta("110102", "Caja chica", { activa: false }),
  cuenta("1102", "Clientes", { tieneMovimientos: true }),
  cuenta("2101", "Proveedores"),
  cuenta("5101", "Ventas"),
];

/** Hoja con filas desde la 2, como en Excel. */
const hoja = (filas: Record<string, string>[]): HojaLeida => ({
  columnasFaltantes: [],
  excedeMaximo: false,
  filas: filas.map((valores, i) => ({ fila: i + 2, valores })),
});

const cta = (codigo: string, nombre: string, naturaleza = "Deudora", tipo = "Activo") => ({
  codigo,
  nombre,
  naturaleza,
  tipo,
});
const saldo = (codigo: string, debe = "", haber = "") => ({ codigo, cuenta: "", debe, haber });

describe("normalizar y codigoPadre", () => {
  it("ignora mayúsculas, tildes y espacios de más", () => {
    expect(normalizar("  Código  ")).toBe("codigo");
    expect(normalizar("Costos  y GASTOS")).toBe("costos y gastos");
  });

  it("calcula el padre como la base: el código del nivel anterior", () => {
    expect(["1", "11", "1101", "110101", "11010101", "1101010101"].map(codigoPadre)).toEqual([
      null,
      "1",
      "11",
      "1101",
      "110101",
      "11010101",
    ]);
  });
});

describe("validarCatalogo", () => {
  it("acepta cuentas nuevas con su padre en el archivo o en el catálogo, en cualquier orden", () => {
    const r = validarCatalogo(
      hoja([
        cta("110103", "Caja de sucursal"),
        cta("21010101", "Proveedor local", "acreedora", "pasivo"),
        cta("210101", "Proveedores locales", "ACREEDORA", "Pasivo"),
        cta("4101", "Costo de ventas", "Deudora", "costos y gastos"),
        cta("41", "Costos de operación", "Deudora", "Costos y Gastos"),
        cta("4", "Costos y gastos", "Deudora", "costos_gastos"),
      ]),
      CATALOGO,
    );
    expect(r.errores).toEqual([]);
    expect(r.valido).toBe(true);
    expect(r.filasLeidas).toBe(6);
    expect(r.filas[2]).toEqual({
      fila: 4,
      codigo: "210101",
      nombre: "Proveedores locales",
      naturaleza: "acreedora",
      tipo: "pasivo",
    });
    expect(r.filas.map((f) => f.tipo)).toEqual([
      "activo",
      "pasivo",
      "pasivo",
      "costos_gastos",
      "costos_gastos",
      "costos_gastos",
    ]);
  });

  it("informa cada error con su fila y columna, y no devuelve filas para cargar", () => {
    const r = validarCatalogo(
      hoja([
        cta("11A", "Con letra"),
        cta("123", "Tres dígitos"),
        cta("110101", "Ya existe"),
        cta("110105", ""),
        cta("110106", "Naturaleza mala", "Positiva"),
        cta("110107", "Tipo malo", "Deudora", "Gasto"),
        cta("110108", "Duplicada"),
        cta("110108", "Duplicada otra vez"),
        cta("910101", "Sin padre"),
        cta("110201", "Padre con movimientos"),
        cta("", "Sin código"),
      ]),
      CATALOGO,
    );
    expect(r.valido).toBe(false);
    expect(r.filas).toEqual([]);
    expect(r.errores).toEqual([
      { fila: 2, columna: "Código", mensaje: "El código «11A» solo debe llevar dígitos." },
      { fila: 3, columna: "Código", mensaje: "El código 123 debe tener 1, 2, 4, 6, 8 o 10 dígitos." },
      { fila: 4, columna: "Código", mensaje: "La cuenta 110101 ya existe en el catálogo de la empresa." },
      { fila: 5, columna: "Nombre", mensaje: "Falta el nombre de la cuenta." },
      { fila: 6, columna: "Naturaleza", mensaje: "Naturaleza inválida: use Deudora o Acreedora." },
      {
        fila: 7,
        columna: "Tipo",
        mensaje:
          "Tipo inválido: use Activo, Pasivo, Patrimonio, Costos y gastos, Ingresos, Liquidadora, Orden.",
      },
      { fila: 9, columna: "Código", mensaje: "El código 110108 ya aparece en la fila 8." },
      {
        fila: 10,
        columna: "Código",
        mensaje: "No existe la cuenta padre 9101 ni en el archivo ni en el catálogo.",
      },
      {
        fila: 11,
        columna: "Código",
        mensaje: "La cuenta 1102 tiene movimientos; no se le pueden crear subcuentas.",
      },
      { fila: 12, columna: "Código", mensaje: "Falta el código." },
    ]);
  });

  it("rechaza una hoja sin las columnas de la plantilla o sin filas", () => {
    const sinColumnas = validarCatalogo(
      { columnasFaltantes: ["Naturaleza", "Tipo"], filas: [], excedeMaximo: false },
      CATALOGO,
    );
    expect(sinColumnas.errores).toEqual([
      {
        fila: null,
        columna: null,
        mensaje:
          "Faltan las columnas Naturaleza, Tipo en la fila 1 de la hoja «Catálogo». Use la plantilla descargada sin cambiar los títulos.",
      },
    ]);
    expect(validarCatalogo(hoja([]), CATALOGO).errores[0]?.mensaje).toBe(
      "El archivo no tiene filas con datos para importar.",
    );
    expect(
      validarCatalogo({ columnasFaltantes: [], filas: [], excedeMaximo: true }, CATALOGO).errores[0]?.mensaje,
    ).toBe("El archivo tiene más de 5000 filas; divídalo en varios.");
  });
});

describe("validarSaldos", () => {
  it("toma las filas con monto, ignora las vacías y calcula el cuadre con decimal.js", () => {
    const r = validarSaldos(
      hoja([
        saldo("110101", "1,250.10"),
        saldo("2101", "", "1000.05"),
        saldo("5101"),
        saldo("1102", "0.1"),
        saldo("5101", "", "250.15"),
        saldo("", "", ""),
      ]),
      CATALOGO,
    );
    expect(r.errores).toEqual([]);
    expect(r.valido).toBe(true);
    expect(r.filas).toEqual([
      { fila: 2, cuentaId: "id-110101", codigo: "110101", debe: "1250.10", haber: "0.00" },
      { fila: 3, cuentaId: "id-2101", codigo: "2101", debe: "0.00", haber: "1000.05" },
      { fila: 5, cuentaId: "id-1102", codigo: "1102", debe: "0.10", haber: "0.00" },
      { fila: 6, cuentaId: "id-5101", codigo: "5101", debe: "0.00", haber: "250.15" },
    ]);
    expect(r.resumen).toEqual({
      totalDebe: "1250.20",
      totalHaber: "1250.20",
      diferencia: "0.00",
      cuadra: true,
    });
  });

  it("informa si no cuadra y avisa los saldos contrarios a la naturaleza, sin bloquear la carga", () => {
    const r = validarSaldos(hoja([saldo("110101", "", "50"), saldo("5101", "", "20")]), CATALOGO);
    expect(r.valido).toBe(true);
    expect(r.resumen).toEqual({ totalDebe: "0.00", totalHaber: "70.00", diferencia: "70.00", cuadra: false });
    expect(r.advertencias).toEqual([
      {
        fila: 2,
        columna: "Haber",
        mensaje: "El saldo de 110101 Caja general es contrario a su naturaleza deudora.",
      },
    ]);
  });

  it("informa cada error con su fila y no devuelve filas para cargar", () => {
    const r = validarSaldos(
      hoja([
        saldo("9999", "10"),
        saldo("1101", "10"),
        saldo("110102", "10"),
        saldo("110101", "10", "5"),
        saldo("110101", "-3"),
        saldo("110101", "1.005"),
        saldo("110101", "diez"),
        saldo("2101", "", "4"),
        saldo("2101", "", "6"),
        saldo("", "8"),
        saldo("5101", "", "1000000000000"),
      ]),
      CATALOGO,
    );
    expect(r.valido).toBe(false);
    expect(r.filas).toEqual([]);
    expect(r.errores).toEqual([
      { fila: 2, columna: "Código", mensaje: "La cuenta 9999 no existe en el catálogo de la empresa." },
      {
        fila: 3,
        columna: "Código",
        mensaje: "La cuenta 1101 no es de último nivel; registre el saldo en sus subcuentas.",
      },
      { fila: 4, columna: "Código", mensaje: "La cuenta 110102 está inactiva." },
      { fila: 5, columna: "Haber", mensaje: "Una fila no puede tener saldo en debe y en haber a la vez." },
      { fila: 6, columna: "Debe", mensaje: "El monto no puede ser negativo." },
      { fila: 7, columna: "Debe", mensaje: "El monto admite como máximo dos decimales." },
      { fila: 8, columna: "Debe", mensaje: "Monto inválido: «diez»." },
      { fila: 10, columna: "Código", mensaje: "La cuenta 2101 ya tiene saldo en la fila 9." },
      { fila: 11, columna: "Código", mensaje: "Falta el código de la cuenta." },
      { fila: 12, columna: "Haber", mensaje: "El monto excede el máximo permitido." },
    ]);
  });

  it("exige al menos un saldo", () => {
    const r = validarSaldos(hoja([saldo("110101"), saldo("5101", "0", "0.00")]), CATALOGO);
    expect(r.errores).toEqual([
      {
        fila: null,
        columna: null,
        mensaje: "El archivo no tiene saldos: escriba al menos un monto en debe o en haber.",
      },
    ]);
  });
});
