// S4-T09 (HU-54): el comprobante de crédito fiscal electrónico coincide con los CCF de CheroPhonex. Se emite como DTE
// cada uno de los ocho CCF del libro de ventas de octubre de 2026 (hojas del libro del caso) y se compara su JSON,
// su venta y su partida con la base imponible, el IVA y el total que trae el caso; las ventas con un solo CCF también
// se comparan con la partida de la contabilidad del caso (cherophonex.json).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DteVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { erroresEsquema } from "../src/modules/facturacion/domain/esquemas-dte.js";
import { VENTAS_CCF_CHEROPHONEX } from "./datos-iva-cherophonex";
import { CONTADOR, iniciarSistemaDte, type SistemaDte } from "./ayudas-dte";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Emitido {
  numero: string;
  dte: DteVista;
  base: string;
  iva: string;
  total: string;
  nrc: string;
  nombre: string;
}

let s: SistemaDte;
const emitidos: Emitido[] = [];

const centavos = (texto: string) => Math.round(Number(texto) * 100);
const suma = (valores: string[]) => valores.reduce((t, v) => t + centavos(v), 0);

const caso = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../packages/db/src/casos/cherophonex.json"), "utf8"),
) as { partidas: { concepto: string; lineas: { cuenta: string; debe: string; haber: string }[] }[] };

beforeAll(async () => {
  s = await iniciarSistemaDte("contable_api_dte_ccf", "0614-010190-101-8");
  for (const [, numero, nrc, nombre, base, iva, total] of VENTAS_CCF_CHEROPHONEX) {
    const dte = await s.emitir({
      tipoDocumento: "ccf",
      sucursalId: s.emp.sucursalId,
      terceroId: s.clientes.get(nrc)!.id,
      condicionPago: "credito",
      lineas: [{ productoId: s.productoId, cantidad: 1, precioUnitario: Number(base) }],
    });
    emitidos.push({ numero, dte, base, iva, total, nrc, nombre });
  }
}, 120_000);

afterAll(async () => {
  await s?.cerrar();
});

describe("los ocho CCF de CheroPhonex como comprobantes electrónicos (S4-T09)", () => {
  it("cada JSON valida contra el esquema fe-ccf-v3 y es un CCF (tipo 03)", () => {
    expect(emitidos).toHaveLength(8);
    for (const { numero, dte } of emitidos) {
      expect(erroresEsquema("03", dte.documento), numero).toEqual([]);
      expect(dte, numero).toMatchObject({
        tipoDte: "03",
        nombreTipo: "Comprobante de crédito fiscal",
        estado: "procesado",
      });
      expect((dte.documento["identificacion"] as Json)["version"]).toBe(3);
    }
  });

  it("base imponible, IVA y total de cada CCF son los del libro de ventas del caso", () => {
    for (const { numero, dte, base, iva, total } of emitidos) {
      const r = dte.documento["resumen"] as Json;
      expect(r["totalGravada"], `${numero} base`).toBe(Number(base));
      expect(r["tributos"], `${numero} IVA`).toEqual([
        expect.objectContaining({ codigo: "20", valor: Number(iva) }),
      ]);
      expect(r["montoTotalOperacion"], `${numero} total`).toBe(Number(total));
      expect(r["totalPagar"], `${numero} total a pagar`).toBe(Number(total));
      expect(dte.total, numero).toBe(total);
      expect(dte.iva, numero).toBe(iva);
      // La retención y la percepción del 1 % no aplican: ni la empresa ni el cliente son grandes contribuyentes
      expect(r["ivaRete1"], numero).toBe(0);
      expect(r["ivaPerci1"], numero).toBe(0);
    }
  });

  it("el receptor es el cliente del caso: su NRC y su razón social", () => {
    for (const { numero, dte, nrc, nombre } of emitidos) {
      expect(dte.documento["receptor"], numero).toMatchObject({
        nrc: nrc.replace(/\D/g, ""),
        nombre,
      });
      expect(dte.receptor, numero).toBe(nombre);
    }
    // CCF-0001 y CCF-0006 son de Tecno Plaza: el mismo receptor en ambos
    const r1 = emitidos[0]!.dte.documento["receptor"] as Json;
    const r6 = emitidos[5]!.dte.documento["receptor"] as Json;
    expect(r6["nit"]).toBe(r1["nit"]);
  });

  it("el IVA del CCF es el 13 % de la base, redondeado al centavo, como en el libro", () => {
    for (const { numero, base, iva } of emitidos) {
      expect(centavos(iva), numero).toBe(Math.round(Number(base) * 13));
    }
  });

  it("el total en letras de cada CCF corresponde a su total", () => {
    for (const { numero, dte, total } of emitidos) {
      const letras = (dte.documento["resumen"] as Json)["totalLetras"] as string;
      expect(letras, numero).toMatch(/^[A-ZÁÉÍÓÚÑ ]+ \d{2}\/100 DÓLARES$/);
      expect(letras, numero).toContain(`${total.split(".")[1]}/100`);
    }
  });

  it("los números de control son correlativos y distintos por CCF", () => {
    const controles = emitidos.map(({ dte }) => dte.numeroControl);
    controles.forEach((control, i) => {
      expect(control).toBe(`DTE-03-M0010001-${String(i + 1).padStart(15, "0")}`);
    });
    expect(new Set(emitidos.map(({ dte }) => dte.codigoGeneracion)).size).toBe(8);
  });
});

describe("la venta y la partida de cada CCF coinciden con el caso (S4-T09)", () => {
  it("la partida de cada venta lleva el IVA a 2109 y las ventas a 5101 con los montos del libro", async () => {
    for (const { numero, dte, base, iva, total } of emitidos) {
      const lineas = (
        await s.c.query(
          `select cu.codigo, d.debe::text debe, d.haber::text haber
           from documentos_comerciales v join partida_detalles d on d.partida_id = v.partida_id
           join cuentas cu on cu.id = d.cuenta_id where v.id = $1 order by d.orden`,
          [dte.documentoId],
        )
      ).rows as { codigo: string; debe: string; haber: string }[];
      const haberDe = (prefijo: string) =>
        suma(lineas.filter((l) => l.codigo.startsWith(prefijo)).map((l) => l.haber));
      const debeDe = (prefijo: string) =>
        suma(lineas.filter((l) => l.codigo.startsWith(prefijo)).map((l) => l.debe));
      expect(haberDe("2109"), `${numero} IVA débito`).toBe(centavos(iva));
      expect(haberDe("5101"), `${numero} ventas`).toBe(centavos(base));
      expect(debeDe("1103") + debeDe("1101"), `${numero} por cobrar o efectivo`).toBe(centavos(total));
    }
  });

  it("los CCF que son una sola venta coinciden con la partida del caso (CCF-0001, 0003, 0005 y 0007)", () => {
    for (const numero of ["CCF-0001", "CCF-0003", "CCF-0005", "CCF-0007"]) {
      const partida = caso.partidas.find(
        (p) =>
          p.concepto.startsWith("Venta de mercadería") &&
          p.concepto.includes(`según ${numero}`) &&
          !p.concepto.includes("facturas"),
      );
      expect(partida, numero).toBeDefined();
      const haber = (cuenta: string) =>
        partida!.lineas.filter((l) => l.cuenta === cuenta).reduce((t, l) => t + centavos(l.haber), 0);
      const emitido = emitidos.find((e) => e.numero === numero)!;
      expect(haber("510101"), `${numero} ventas`).toBe(centavos(emitido.base));
      expect(haber("2109"), `${numero} IVA`).toBe(centavos(emitido.iva));
      const debe = partida!.lineas.reduce((t, l) => t + centavos(l.debe), 0);
      expect(debe, `${numero} total cobrado`).toBe(centavos(emitido.total));
    }
  });

  it("el IVA débito de los ocho CCF suma lo que dice el libro y coincide con la contabilidad", async () => {
    const delLibro = suma(VENTAS_CCF_CHEROPHONEX.map((f) => f[5]));
    expect(delLibro).toBe(333100);
    expect(
      suma(emitidos.map((e) => (e.dte.documento["resumen"] as Json)["tributos"][0].valor.toFixed(2))),
    ).toBe(delLibro);
    const [fila] = (
      await s.c.query(
        `select coalesce(sum(d.haber - d.debe), 0)::text iva
         from partida_detalles d join partidas p on p.id = d.partida_id join cuentas cu on cu.id = d.cuenta_id
         where p.empresa_id = $1 and cu.codigo like '2109%'`,
        [s.emp.empresaId],
      )
    ).rows;
    expect(centavos(fila.iva)).toBe(delLibro);
  });

  it("el CCF exige el NIT y el NRC del cliente: sin ellos no se emite", async () => {
    const sinNrc = (
      await s.c.query(
        `insert into terceros (empresa_id, nombre, nit, es_cliente) values ($1, 'Cliente sin NRC', '0000-000000-105-1', true) returning id`,
        [s.emp.empresaId],
      )
    ).rows[0].id as string;
    const r = await s.pedir("POST", "/dte/ventas", CONTADOR, {
      tipoDocumento: "ccf",
      sucursalId: s.emp.sucursalId,
      terceroId: sinNrc,
      condicionPago: "credito",
      lineas: [{ productoId: s.productoId, cantidad: 1, precioUnitario: 100 }],
    });
    expect(r.status).toBe(422);
  });
});
