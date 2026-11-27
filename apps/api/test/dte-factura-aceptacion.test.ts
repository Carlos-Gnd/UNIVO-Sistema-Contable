// S4-T06 (HU-53): el JSON de la factura electrónica valida contra el esquema de Hacienda y coincide con la venta.
// Prueba de aceptación independiente de la de desarrollo: además de validar, comprueba que el validador rechaza
// documentos rotos y compara cada dato del JSON con la venta registrada y con los datos de la empresa emisora.
import type { DocumentoComercialVista, DteVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { erroresEsquema } from "../src/modules/facturacion/domain/esquemas-dte.js";
import { iniciarSistemaDte, type SistemaDte } from "./ayudas-dte";

let s: SistemaDte;
let dte: DteVista;
let venta: DocumentoComercialVista;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const copia = (): Json => structuredClone(dte.documento) as Json;
const dinero = (n: number) => Math.round(n * 100) / 100;

beforeAll(async () => {
  s = await iniciarSistemaDte("contable_api_dte_factura", "0614-010190-101-7");
  // Factura de consumidor final con precios con IVA: dos teléfonos, tres fundas y un servicio exento
  dte = await s.emitir({
    tipoDocumento: "factura",
    sucursalId: s.emp.sucursalId,
    condicionPago: "contado",
    cuentaPagoId: s.cajaId,
    lineas: [
      { productoId: s.productoId, cantidad: 2, precioUnitario: 904 },
      { productoId: s.productoId, cantidad: 3, precioUnitario: 56.5 },
      {
        cuentaId: await s.emp.cuenta("5101"),
        descripcion: "Configuración del equipo",
        cantidad: 1,
        precioUnitario: 25,
        clase: "exenta",
      },
    ],
  });
  const r = await s.pedir("GET", `/ventas/${dte.documentoId}`, "11111111-1111-4111-8111-111111111111");
  venta = r.cuerpo as unknown as DocumentoComercialVista;
}, 90_000);

afterAll(async () => {
  await s?.cerrar();
});

describe("el JSON de la factura valida contra el esquema de Hacienda (S4-T06)", () => {
  it("cumple el esquema fe-fc-v1", () => {
    expect(erroresEsquema("01", dte.documento)).toEqual([]);
  });

  it("el validador rechaza un documento al que le falta o le sobra algo", () => {
    const sinControl = copia();
    delete sinControl["identificacion"].numeroControl;
    expect(erroresEsquema("01", sinControl).join(" ")).toMatch(/numeroControl/);

    const versionDeOtroTipo = copia();
    versionDeOtroTipo["identificacion"].version = 3;
    expect(erroresEsquema("01", versionDeOtroTipo)).not.toEqual([]);

    const controlMalFormado = copia();
    controlMalFormado["identificacion"].numeroControl = "DTE-01-M001-1";
    expect(erroresEsquema("01", controlMalFormado)).not.toEqual([]);

    const codigoNoUuid = copia();
    codigoNoUuid["identificacion"].codigoGeneracion = "no-es-un-uuid";
    expect(erroresEsquema("01", codigoNoUuid)).not.toEqual([]);

    const nitCorto = copia();
    nitCorto["emisor"].nit = "123";
    expect(erroresEsquema("01", nitCorto)).not.toEqual([]);

    const totalComoTexto = copia();
    totalComoTexto["resumen"].totalPagar = "313.50";
    expect(erroresEsquema("01", totalComoTexto)).not.toEqual([]);

    const sinCuerpo = copia();
    sinCuerpo["cuerpoDocumento"] = [];
    expect(erroresEsquema("01", sinCuerpo)).not.toEqual([]);
  });

  it("un CCF no pasa por el esquema de la factura ni al revés", () => {
    expect(erroresEsquema("03", dte.documento)).not.toEqual([]);
  });
});

describe("el JSON de la factura coincide con la venta registrada (S4-T06)", () => {
  it("identificación: número de control, fecha, tipo y ambiente de pruebas", () => {
    const i = dte.documento["identificacion"] as Json;
    expect(i).toMatchObject({
      version: 1,
      ambiente: "00",
      tipoDte: "01",
      numeroControl: venta.numeroDocumento,
      codigoGeneracion: dte.codigoGeneracion,
      fecEmi: venta.fecha,
      tipoMoneda: "USD",
    });
    expect(venta.tipoDocumento).toBe("factura");
    expect(i["horEmi"]).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("emisor: los datos de la empresa", async () => {
    const e = (
      await s.c.query("select nit, nrc, nombre, telefono, correo, direccion from empresas where id = $1", [
        s.emp.empresaId,
      ])
    ).rows[0];
    expect(dte.documento["emisor"] as Json).toMatchObject({
      nit: String(e.nit).replace(/\D/g, ""),
      nrc: String(e.nrc).replace(/\D/g, ""),
      nombre: e.nombre,
      telefono: e.telefono,
      correo: e.correo,
      direccion: { complemento: e.direccion },
    });
  });

  it("receptor: una factura a consumidor final no lleva datos del cliente", () => {
    const receptor = dte.documento["receptor"] as Json;
    expect(Object.values(receptor).every((v) => v === null)).toBe(true);
    expect(venta.tercero).toBeNull();
  });

  it("cuerpo: una línea del JSON por cada línea de la venta, con su cantidad, precio y clase", () => {
    const lineas = dte.documento["cuerpoDocumento"] as Json[];
    expect(lineas).toHaveLength(venta.lineas.length);
    venta.lineas.forEach((l, i) => {
      const j = lineas[i]!;
      expect(j["numItem"]).toBe(i + 1);
      expect(j["cantidad"]).toBe(Number(l.cantidad));
      expect(j["precioUni"]).toBe(Number(l.precioUnitario));
      expect(j["descripcion"]).toBe(l.descripcion);
      const venta_ = j["ventaGravada"] + j["ventaExenta"] + j["ventaNoSuj"];
      expect(dinero(venta_), `línea ${i + 1}`).toBe(dinero(Number(l.monto)));
      if (l.clase === "exenta") expect(j["ventaExenta"]).toBe(dinero(Number(l.monto)));
      if (l.clase === "gravada") expect(j["ventaGravada"]).toBe(dinero(Number(l.monto)));
    });
  });

  it("resumen: los totales del JSON son los de la venta y suman sus líneas", () => {
    const r = dte.documento["resumen"] as Json;
    const lineas = dte.documento["cuerpoDocumento"] as Json[];
    expect(r["totalGravada"]).toBe(dinero(lineas.reduce((t, l) => t + l["ventaGravada"], 0)));
    expect(r["totalExenta"]).toBe(dinero(lineas.reduce((t, l) => t + l["ventaExenta"], 0)));
    // Precios con IVA incluido: gravado 2 × 904 + 3 × 56.50 = 1,977.50, IVA 13 % = 227.50
    expect(r["totalGravada"]).toBe(1977.5);
    expect(r["totalIva"]).toBe(Number(venta.iva));
    expect(r["totalIva"]).toBe(dinero(1977.5 - 1977.5 / 1.13));
    expect(dinero(lineas.reduce((t, l) => t + (l["ivaItem"] ?? 0), 0))).toBe(r["totalIva"]);
    expect(r["totalPagar"]).toBe(Number(venta.total));
    expect(r["totalPagar"]).toBe(dinero(r["totalGravada"] + r["totalExenta"]));
    expect(dte.total).toBe(venta.total);
    expect(dte.iva).toBe(venta.iva);
  });

  it("el total en letras corresponde al total a pagar", () => {
    const r = dte.documento["resumen"] as Json;
    expect(r["totalLetras"]).toBe("DOS MIL DOS 50/100 DÓLARES");
    expect(Number(venta.total)).toBe(2002.5);
  });

  it("condición de pago: al contado con el pago por el total", () => {
    const r = dte.documento["resumen"] as Json;
    expect(r["condicionOperacion"]).toBe(1);
    expect(r["pagos"]).toEqual([expect.objectContaining({ montoPago: Number(venta.total) })]);
  });
});
