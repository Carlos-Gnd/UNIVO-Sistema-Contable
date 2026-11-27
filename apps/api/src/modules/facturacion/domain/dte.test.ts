import { calcularTotalesDocumento, Dinero } from "@contable/shared";
import { describe, expect, it } from "vitest";
import {
  actividadEconomica,
  construirDte,
  departamentoDeDireccion,
  exigirEmisor,
  fechaHoraElSalvador,
  ivaPorLinea,
  nuevoCodigoGeneracion,
  numeroControl,
  selloRecepcion,
  type DatosEmisionDte,
  type EmpresaEmisora,
  type LineaDte,
  type TipoDte,
} from "./dte.js";
import { DteInvalidoError, erroresEsquema, exigirEsquema } from "./esquemas-dte.js";
import { enteroEnLetras, totalEnLetras } from "./total-letras.js";

const empresa: EmpresaEmisora = {
  nombre: "Lenin Hernández (CheroPhonex)",
  nombreComercial: "CheroPhonex",
  nit: "1217-150890-101-2",
  nrc: "123456-7",
  actividadEconomica: "47411 · Venta de teléfonos y accesorios",
  direccion: "Barrio El Centro, San Miguel",
  telefono: "2660-0000",
  correo: "ventas@cherophonex.test",
};
const sucursal = { codigoEstablecimiento: "M001", codigoPuntoVenta: "0001", esMatriz: true, direccion: null };
const cliente = {
  nombre: "Distribuidora Oriental, S.A. de C.V.",
  nit: "0614-010190-102-3",
  nrc: "765432-1",
  actividadEconomica: null,
  direccion: "Usulután",
  telefono: "2662-1111",
  correo: "compras@oriental.test",
};

function datos(tipo: TipoDte, lineas: LineaDte[], extra: Partial<DatosEmisionDte> = {}): DatosEmisionDte {
  const tipoDocumento = tipo === "01" ? "factura" : "ccf";
  const totales = calcularTotalesDocumento({
    operacion: "venta",
    tipoDocumento,
    lineas: lineas.map((l) => ({ monto: l.monto, clase: l.clase, bien: l.bien })),
    empresa: "otro",
    tercero: "otro",
  });
  return {
    tipo,
    codigoGeneracion: nuevoCodigoGeneracion(),
    numeroControl: numeroControl(tipo, "M001", "0001", 7),
    fecha: "2026-11-27",
    hora: "10:15:00",
    empresa,
    sucursal,
    receptor: tipo === "01" ? null : cliente,
    lineas,
    totales,
    condicionPago: "contado",
    diasCredito: 0,
    observaciones: null,
    ...extra,
  };
}

const telefono = (monto: string, cantidad = "1"): LineaDte => ({
  descripcion: "Teléfono Galaxy A15",
  codigo: "TEL-A15",
  cantidad,
  precioUnitario: Dinero.de(monto).dividido(cantidad).aTexto(),
  monto,
  clase: "gravada",
  bien: true,
});

describe("identificación del DTE", () => {
  it("arma el número de control con tipo, establecimiento, punto de venta y 15 dígitos", () => {
    expect(numeroControl("01", "M001", "0001", 1)).toBe("DTE-01-M0010001-000000000000001");
    expect(numeroControl("03", "s2", "1", 42)).toBe("DTE-03-00S20001-000000000000042");
    expect(() => numeroControl("01", "M001", "0001", 0)).toThrow(RangeError);
  });

  it("el código de generación es un UUID en mayúsculas y no se repite", () => {
    const a = nuevoCodigoGeneracion();
    expect(a).toMatch(/^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/);
    expect(nuevoCodigoGeneracion()).not.toBe(a);
  });

  it("toma la fecha y la hora de El Salvador (UTC−6)", () => {
    expect(fechaHoraElSalvador(new Date("2026-11-28T03:30:05Z"))).toEqual({
      fecha: "2026-11-27",
      hora: "21:30:05",
    });
  });

  it("el sello simulado tiene 40 caracteres y depende del documento firmado", () => {
    const s = selloRecepcion("2026", "ABC", "firma", "secreto");
    expect(s).toMatch(/^2026[A-F0-9]{36}$/);
    expect(selloRecepcion("2026", "ABC", "otra firma", "secreto")).not.toBe(s);
  });
});

describe("datos de emisor y receptor", () => {
  it("separa el código de actividad del texto y usa «Otros» si no hay código", () => {
    expect(actividadEconomica("46900 · Venta al por mayor")).toEqual({
      codigo: "46900",
      descripcion: "Venta al por mayor",
    });
    expect(actividadEconomica("Comercio")).toEqual({ codigo: "10005", descripcion: "Comercio" });
    expect(actividadEconomica(null)).toEqual({ codigo: "10005", descripcion: "Otros" });
  });

  it("reconoce el departamento en la dirección", () => {
    expect(departamentoDeDireccion("Col. Ciudad Jardín, San Miguel")).toBe("12");
    expect(departamentoDeDireccion("Usulután")).toBe("11");
    expect(departamentoDeDireccion("Calle Arce, San Salvador")).toBe("06");
    expect(departamentoDeDireccion(null)).toBe("06");
  });

  it("exige NRC, dirección, teléfono y correo de la empresa", () => {
    expect(() => exigirEmisor(empresa)).not.toThrow();
    expect(() => exigirEmisor({ ...empresa, nrc: null, correo: null })).toThrow(/NRC, correo/);
  });
});

describe("total en letras", () => {
  it("escribe enteros y centavos en mayúsculas", () => {
    expect(enteroEnLetras(0)).toBe("CERO");
    expect(enteroEnLetras(21)).toBe("VEINTIÚN");
    expect(enteroEnLetras(100)).toBe("CIEN");
    expect(enteroEnLetras(1_001)).toBe("MIL UN");
    expect(enteroEnLetras(2_521_000)).toBe("DOS MILLONES QUINIENTOS VEINTIÚN MIL");
    expect(totalEnLetras("113.50")).toBe("CIENTO TRECE 50/100 DÓLARES");
    expect(totalEnLetras("1.5")).toBe("UN 50/100 DÓLARES");
  });
});

describe("factura electrónica (01)", () => {
  it("valida contra el esquema y sus montos coinciden con la venta", () => {
    const d = datos("01", [telefono("226.00", "2"), { ...telefono("10.00"), clase: "exenta", bien: false }]);
    const dte = construirDte(d) as {
      resumen: Record<string, number>;
      cuerpoDocumento: Record<string, number>[];
      receptor: Record<string, unknown>;
    };
    expect(erroresEsquema("01", dte)).toEqual([]);
    // El precio incluye el IVA: 226 = 200 de base + 26 de IVA
    expect(d.totales).toMatchObject({ totalGravado: "200.00", iva: "26.00", total: "236.00" });
    expect(dte.resumen).toMatchObject({
      totalGravada: 226,
      totalExenta: 10,
      totalIva: 26,
      montoTotalOperacion: 236,
      totalPagar: 236,
    });
    expect(dte.cuerpoDocumento[0]).toMatchObject({ cantidad: 2, ventaGravada: 226, ivaItem: 26 });
    expect(dte.receptor["nombre"]).toBeNull();
  });

  it("el IVA de las líneas suma exactamente el IVA del documento", () => {
    const lineas = [telefono("10.00"), telefono("10.00"), telefono("10.00")];
    const d = datos("01", lineas);
    const iva = ivaPorLinea(lineas, d.totales.iva);
    expect(Dinero.sumar(iva).aTexto()).toBe(d.totales.iva);
  });

  it("un documento alterado no pasa el esquema", () => {
    const dte = construirDte(datos("01", [telefono("113.00")])) as {
      identificacion: Record<string, unknown>;
    };
    dte.identificacion["numeroControl"] = "DTE-01-123";
    expect(() => exigirEsquema("01", dte)).toThrow(DteInvalidoError);
  });
});
