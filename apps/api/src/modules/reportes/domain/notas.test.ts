// Armado de las notas a los estados financieros (HU-44, S3-T31 y S3-T33).
import type { Naturaleza, TipoCuenta } from "@contable/shared";
import { describe, expect, it } from "vitest";
import type { FilaSaldos } from "./balanza.js";
import { armarNotas, type DatosEmpresaNotas } from "./notas.js";

const TIPO: Record<string, TipoCuenta> = { "1": "activo", "2": "pasivo", "3": "patrimonio" };

function fila(codigo: string, debe: string, haber: string, saldoInicial = "0", nombre = codigo): FilaSaldos {
  const tipo = TIPO[codigo[0]!]!;
  const naturaleza: Naturaleza = tipo === "activo" ? "deudora" : "acreedora";
  return {
    cuentaId: codigo,
    codigo,
    nombre,
    naturaleza,
    tipo,
    saldoInicial,
    movimientoDebe: debe,
    movimientoHaber: haber,
  };
}

const EMPRESA: DatosEmpresaNotas = {
  nombre: "CHERO PHONEX",
  nit: "0614-010190-101-5",
  nrc: "312456-7",
  actividadEconomica: "la venta de teléfonos celulares y accesorios",
  tipoContribuyente: "persona_natural",
  formatoEstados: "clase",
  metodoValuacion: "promedio_ponderado",
  sistemaInventario: "perpetuo",
  sucursalesActivas: 2,
};

const FILAS: FilaSaldos[] = [
  fila("110102", "200.00", "0", "0", "Caja Chica"),
  fila("11010301", "20000.00", "1929.11", "0", "Cuenta Corriente"),
  fila("1109", "40000.00", "34112.00", "0", "Inventarios"),
  fila("120105", "2500.00", "0", "0", "Mobiliario y Equipo"),
  fila("120204", "0", "104.17", "0", "Mobiliario y Equipo"),
  fila("210601", "0", "72.00", "0", "ISSS (Salud)"),
  fila("210701", "0", "180.00", "0", "ISSS (Salud)"),
  fila("2109", "5986.67", "5986.67"),
  fila("211103", "0", "643.67", "0", "IVA"),
  fila("310101", "0", "3750.00", "0", "Socio Uno"),
  fila("310102", "0", "3750.00", "0", "Socio Dos"),
];
const NOMBRES = new Map([
  ["2106", "Retenciones por Pagar"],
  ["2107", "Obligaciones por Beneficios a Empleados"],
  ["2111", "Impuestos por Pagar"],
]);

const notas = (guardadas = new Map<string, { version: number; texto: string }>()) =>
  armarNotas(EMPRESA, FILAS, NOMBRES, guardadas);
const nota = (clave: string, n = notas()) => n.find((x) => x.clave === clave)!;
const campo = (clave: string, nombre: string) => nota(clave).campos.find((c) => c.nombre === nombre)?.valor;

describe("armarNotas", () => {
  it("entrega las siete notas de la plantilla, numeradas en orden", () => {
    expect(notas().map((n) => [n.numero, n.clave])).toEqual([
      [1, "entidad"],
      [2, "politicas"],
      [3, "efectivo"],
      [4, "inventarios"],
      [5, "activo-fijo"],
      [6, "obligaciones"],
      [7, "capital"],
    ]);
  });

  it("propone el texto con los datos de la empresa y sus políticas", () => {
    expect(nota("entidad").textoSugerido).toBe(
      "CHERO PHONEX es una persona natural constituida en El Salvador, dedicada a la venta de teléfonos celulares y accesorios. Opera con 2 sucursales.",
    );
    expect(nota("politicas").textoSugerido).toContain("costo promedio ponderado");
    expect(nota("politicas").textoSugerido).toContain("sistema perpetuo");
    expect(campo("entidad", "NRC")).toBe("312456-7");
  });

  it("sin texto guardado usa el sugerido y no figura como editada", () => {
    const n = nota("efectivo");
    expect(n.texto).toBe(n.textoSugerido);
    expect(n.editada).toBe(false);
    expect(n.version).toBeNull();
  });

  it("con texto guardado usa la versión vigente", () => {
    const n = nota("capital", notas(new Map([["capital", { version: 3, texto: "Seis socios." }]])));
    expect(n.texto).toBe("Seis socios.");
    expect(n.editada).toBe(true);
    expect(n.version).toBe(3);
    expect(n.textoSugerido).not.toBe("Seis socios.");
  });

  it("llena el efectivo por caja y bancos, y su tabla suma el total", () => {
    expect(campo("efectivo", "Caja chica")).toBe("200.00");
    expect(campo("efectivo", "Bancos")).toBe("18070.89");
    expect(campo("efectivo", "Total")).toBe("18270.89");
    expect(nota("efectivo").tabla?.renglones.at(-1)).toEqual({
      concepto: "Total",
      valores: ["18270.89"],
      total: true,
    });
  });

  it("llena el inventario con entradas, salidas y saldo final", () => {
    expect(campo("inventarios", "Entradas del período")).toBe("40000.00");
    expect(campo("inventarios", "Salidas del período")).toBe("34112.00");
    expect(campo("inventarios", "Inventario final")).toBe("5888.00");
  });

  it("llena el activo fijo: costo, depreciación acumulada y valor en libros", () => {
    expect(campo("activo-fijo", "Costo")).toBe("2500.00");
    expect(campo("activo-fijo", "Depreciación acumulada")).toBe("104.17");
    expect(campo("activo-fijo", "Valor en libros")).toBe("2395.83");
    expect(nota("activo-fijo").tabla?.renglones.map((r) => r.concepto)).toEqual([
      "Costo: Mobiliario y Equipo",
      "Costo total",
      "(−) Depreciación acumulada: Mobiliario y Equipo",
      "Depreciación acumulada total",
      "Valor en libros",
    ]);
  });

  it("agrupa las obligaciones por rubro y calcula el total del pasivo", () => {
    expect(campo("obligaciones", "Retenciones por pagar")).toBe("72.00");
    expect(campo("obligaciones", "Obligaciones con empleados")).toBe("180.00");
    expect(campo("obligaciones", "Impuestos por pagar")).toBe("643.67");
    expect(campo("obligaciones", "Otras obligaciones")).toBeUndefined();
    expect(campo("obligaciones", "Total")).toBe("895.67");
  });

  it("suma el capital de todas las cuentas y cuenta cuántas lo forman", () => {
    expect(campo("capital", "Capital total")).toBe("7500.00");
    expect(campo("capital", "Cuentas de capital")).toBe("2");
  });

  it("sin saldos no inventa tablas ni cifras", () => {
    const vacias = armarNotas(EMPRESA, [], NOMBRES, new Map());
    for (const clave of ["efectivo", "inventarios", "activo-fijo", "obligaciones", "capital"]) {
      expect(vacias.find((n) => n.clave === clave)?.tabla).toBeNull();
    }
    expect(vacias.find((n) => n.clave === "efectivo")?.campos.find((c) => c.nombre === "Total")?.valor).toBe(
      "0.00",
    );
  });

  it("una sociedad con una sola sucursal y sin actividad redacta el texto sin ellas", () => {
    const n = armarNotas(
      { ...EMPRESA, tipoContribuyente: "sociedad", actividadEconomica: null, sucursalesActivas: 1 },
      [],
      NOMBRES,
      new Map(),
    ).find((x) => x.clave === "entidad")!;
    expect(n.textoSugerido).toBe(
      "CHERO PHONEX es una sociedad constituida en El Salvador. Opera con una sucursal.",
    );
    expect(
      armarNotas({ ...EMPRESA, tipoContribuyente: "sociedad" }, [], NOMBRES, new Map()).find(
        (x) => x.clave === "capital",
      )?.textoSugerido,
    ).toContain("accionistas");
  });
});
