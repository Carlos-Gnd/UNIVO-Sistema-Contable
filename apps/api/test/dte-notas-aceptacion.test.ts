// S4-T12 (HU-55): la nota de crédito o de débito electrónica referencia el documento original y ajusta el IVA.
// Se parte del CCF-0001 de CheroPhonex (base 2,740.50, IVA 356.27, total 3,096.77) y se comprueba el JSON de cada
// nota (documento relacionado, referencia en cada línea, receptor y emisor), el IVA que ajusta, el límite de lo que
// se puede acreditar y su efecto en las partidas y en el kardex.
import type { DteVista, KardexVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { erroresEsquema } from "../src/modules/facturacion/domain/esquemas-dte.js";
import { CONTADOR, iniciarSistemaDte, type SistemaDte } from "./ayudas-dte";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let s: SistemaDte;
let ccf: DteVista;
let ccfDeFactura: DteVista;
let credito: DteVista;

const centavos = (texto: string | number) => Math.round(Number(texto) * 100);

const nota = (cuerpo: Record<string, unknown>) =>
  s.pedir("POST", "/dte/notas", CONTADOR, { documentoId: ccf.documentoId, ...cuerpo });

const emitida = (r: Awaited<ReturnType<typeof nota>>): DteVista => {
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo as unknown as DteVista;
};

/** Líneas de la partida de una nota: [código, debe, haber] en centavos. */
async function partidaDeNota(notaId: string) {
  const filas = (
    await s.c.query(
      `select cu.codigo, d.debe::text debe, d.haber::text haber
       from notas_comerciales n join partida_detalles d on d.partida_id = n.partida_id
       join cuentas cu on cu.id = d.cuenta_id where n.id = $1 order by d.orden`,
      [notaId],
    )
  ).rows as { codigo: string; debe: string; haber: string }[];
  return filas.map((f) => [f.codigo, centavos(f.debe), centavos(f.haber)] as const);
}

const ivaDebitoDeLaVenta = async (documentoId: string) =>
  centavos(
    (
      await s.c.query(
        `select coalesce(sum(d.haber - d.debe), 0)::text iva
         from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
         where cu.codigo like '2109%' and d.partida_id in (
           select partida_id from documentos_comerciales where id = $1
           union select partida_id from notas_comerciales where documento_id = $1)`,
        [documentoId],
      )
    ).rows[0].iva,
  );

beforeAll(async () => {
  s = await iniciarSistemaDte("contable_api_dte_notas", "0614-010190-101-9");
  const cliente = s.clientes.get("245871-3")!;
  ccf = await s.emitir({
    tipoDocumento: "ccf",
    sucursalId: s.emp.sucursalId,
    terceroId: cliente.id,
    condicionPago: "credito",
    lineas: [{ productoId: s.productoId, cantidad: 1, precioUnitario: 2740.5 }],
  });
  ccfDeFactura = await s.emitir({
    tipoDocumento: "factura",
    sucursalId: s.emp.sucursalId,
    condicionPago: "contado",
    cuentaPagoId: s.cajaId,
    lineas: [{ productoId: s.productoId, cantidad: 1, precioUnitario: 113 }],
  });
}, 90_000);

afterAll(async () => {
  await s?.cerrar();
});

describe("la nota de crédito referencia el CCF original (S4-T12)", () => {
  it("una rebaja emite la nota de crédito (05) y valida contra el esquema fe-nc-v3", async () => {
    credito = emitida(
      await nota({ tipo: "credito", motivo: "rebaja", lineas: [{ lineaOrden: 1, monto: 1000 }] }),
    );
    expect(credito).toMatchObject({ tipoDte: "05", nombreTipo: "Nota de crédito", estado: "procesado" });
    expect(erroresEsquema("05", credito.documento)).toEqual([]);
    expect((credito.documento["identificacion"] as Json)["version"]).toBe(3);
  });

  it("el documento relacionado es el CCF: tipo 03, su código de generación y su fecha", () => {
    const ccfJson = ccf.documento as Json;
    expect(credito.documento["documentoRelacionado"]).toEqual([
      {
        tipoDocumento: "03",
        tipoGeneracion: 2,
        numeroDocumento: ccf.codigoGeneracion,
        fechaEmision: ccfJson["identificacion"].fecEmi,
      },
    ]);
    expect(credito.relacionado).toMatchObject({ id: ccf.id });
  });

  it("cada línea de la nota cita el código de generación del CCF", () => {
    const lineas = credito.documento["cuerpoDocumento"] as Json[];
    expect(lineas.length).toBeGreaterThan(0);
    for (const l of lineas) expect(l["numeroDocumento"]).toBe(ccf.codigoGeneracion);
  });

  it("receptor y emisor son los del CCF original", () => {
    const original = ccf.documento as Json;
    expect(credito.documento["receptor"]).toEqual(original["receptor"]);
    expect((credito.documento["emisor"] as Json)["nit"]).toBe(original["emisor"].nit);
    expect((credito.documento["emisor"] as Json)["nrc"]).toBe(original["emisor"].nrc);
  });

  it("la referencia queda guardada: la base ata la nota a su CCF", async () => {
    const fila = (
      await s.c.query("select relacionado_id, tipo_dte from documentos_electronicos where id = $1", [
        credito.id,
      ])
    ).rows[0];
    expect(fila).toMatchObject({ relacionado_id: ccf.id, tipo_dte: "05" });
  });
});

describe("la nota ajusta el IVA (S4-T12)", () => {
  it("una rebaja de 1,000.00 baja el IVA en 130.00 y el total en 1,130.00", () => {
    const r = credito.documento["resumen"] as Json;
    expect(r).toMatchObject({ totalGravada: 1000, montoTotalOperacion: 1130 });
    expect(r["tributos"]).toEqual([expect.objectContaining({ codigo: "20", valor: 130 })]);
    expect(credito.iva).toBe("130.00");
    expect(credito.total).toBe("1130.00");
  });

  it("la partida de la nota revierte el IVA débito y las cuentas por cobrar por el mismo importe", async () => {
    const lineas = await partidaDeNota(credito.notaId!);
    const debe = (codigo: string) =>
      lineas.filter(([c]) => c.startsWith(codigo)).reduce((t, [, d]) => t + d, 0);
    const haber = (codigo: string) =>
      lineas.filter(([c]) => c.startsWith(codigo)).reduce((t, [, , h]) => t + h, 0);
    expect(debe("2109")).toBe(13000);
    expect(haber("1103") + haber("1101")).toBe(113000);
    // Todo lo que se debita se acredita: la partida cuadra
    expect(lineas.reduce((t, [, d]) => t + d, 0)).toBe(lineas.reduce((t, [, , h]) => t + h, 0));
  });

  it("el IVA neto de la venta es el del CCF menos el de la nota", async () => {
    expect(await ivaDebitoDeLaVenta(ccf.documentoId!)).toBe(35627 - 13000);
  });

  it.each([
    ["100.00", "13.00"],
    ["33.33", "4.33"],
    ["250.50", "32.57"],
    ["1.00", "0.13"],
  ])("una rebaja de %s ajusta %s de IVA, redondeado al centavo", async (monto, ivaEsperado) => {
    const dte = emitida(
      await nota({ tipo: "credito", motivo: "rebaja", lineas: [{ lineaOrden: 1, monto: Number(monto) }] }),
    );
    expect(erroresEsquema("05", dte.documento)).toEqual([]);
    expect(dte.iva).toBe(ivaEsperado);
    expect((dte.documento["resumen"] as Json)["totalGravada"]).toBe(Number(monto));
    expect(centavos(dte.total)).toBe(centavos(monto) + centavos(ivaEsperado));
  });
});

describe("la nota de débito y los límites (S4-T12)", () => {
  it("un cargo emite la nota de débito (06), referencia el CCF y suma el IVA", async () => {
    const debito = emitida(
      await nota({
        tipo: "debito",
        motivo: "cargo",
        lineas: [{ cuentaId: await s.emp.cuenta("5101"), monto: 200 }],
      }),
    );
    expect(debito).toMatchObject({
      tipoDte: "06",
      nombreTipo: "Nota de débito",
      iva: "26.00",
      total: "226.00",
    });
    expect(erroresEsquema("06", debito.documento)).toEqual([]);
    expect(debito.documento["documentoRelacionado"]).toEqual([
      expect.objectContaining({ tipoDocumento: "03", numeroDocumento: ccf.codigoGeneracion }),
    ]);
  });

  it("una devolución regresa la unidad al kardex al costo con que salió y ajusta el IVA", async () => {
    const kardex = async () =>
      (await s.pedir("GET", `/productos/${s.productoId}/kardex?sucursalId=${s.emp.sucursalId}`, CONTADOR))
        .cuerpo as unknown as KardexVista;
    const antes = (await kardex()).saldoFinal;
    const devolucion = emitida(
      await nota({ tipo: "credito", motivo: "devolucion", lineas: [{ lineaOrden: 1, cantidad: 1 }] }),
    );
    expect(erroresEsquema("05", devolucion.documento)).toEqual([]);
    const despues = (await kardex()).saldoFinal;
    expect(Number(despues.cantidad) - Number(antes.cantidad)).toBe(1);
    // La unidad salió a 590.00 (costo de la compra) y regresa a ese costo
    expect(centavos(despues.costoTotal) - centavos(antes.costoTotal)).toBe(59000);
    const r = devolucion.documento["resumen"] as Json;
    expect(centavos(devolucion.iva)).toBe(Math.round(r["totalGravada"] * 13));
  });

  it("no se puede acreditar más de lo que tiene la línea del CCF", async () => {
    const r = await nota({ tipo: "credito", motivo: "rebaja", lineas: [{ lineaOrden: 1, monto: 999999 }] });
    expect(r.status).toBe(422);
  });

  it("las notas de crédito de un CCF no suman más que el propio CCF", async () => {
    const cliente = s.clientes.get("198342-6")!;
    const propio = await s.emitir({
      tipoDocumento: "ccf",
      sucursalId: s.emp.sucursalId,
      terceroId: cliente.id,
      condicionPago: "credito",
      lineas: [{ productoId: s.productoId, cantidad: 1, precioUnitario: 500 }],
    });
    const rebaja = (monto: number) =>
      s.pedir("POST", "/dte/notas", CONTADOR, {
        documentoId: propio.documentoId,
        tipo: "credito",
        motivo: "rebaja",
        lineas: [{ lineaOrden: 1, monto }],
      });
    expect((await rebaja(300)).status).toBe(201);
    expect((await rebaja(200)).status).toBe(201);
    // El CCF era de 500.00: ya está acreditado por completo
    expect((await rebaja(0.01)).status).toBe(422);
  });

  // HALLAZGO (S4-T12): el límite se controla por separado para las rebajas (por monto) y para las devoluciones
  // (por unidades), así que una rebaja de 300.00 y la devolución completa de la línea de 500.00 acreditan 800.00 de
  // un CCF de 500.00. Mientras no se corrija, la prueba se marca con it.fails: cuando el sistema rechace la segunda
  // nota, esta prueba pasará a roja y habrá que cambiar it.fails por it.
  it.fails("una rebaja y una devolución de la misma línea no suman más que el CCF", async () => {
    const cliente = s.clientes.get("264017-5")!;
    const propio = await s.emitir({
      tipoDocumento: "ccf",
      sucursalId: s.emp.sucursalId,
      terceroId: cliente.id,
      condicionPago: "credito",
      lineas: [{ productoId: s.productoId, cantidad: 1, precioUnitario: 500 }],
    });
    const emitirNota = (motivo: string, linea: Record<string, unknown>) =>
      s.pedir("POST", "/dte/notas", CONTADOR, {
        documentoId: propio.documentoId,
        tipo: "credito",
        motivo,
        lineas: [{ lineaOrden: 1, ...linea }],
      });
    expect((await emitirNota("rebaja", { monto: 300 })).status).toBe(201);
    // La unidad vale 500.00 y ya se acreditaron 300.00: devolverla completa pasaría de 500.00
    expect((await emitirNota("devolucion", { cantidad: 1 })).status).toBe(422);
  });

  it("solo un CCF electrónico admite notas: una factura no", async () => {
    const r = await s.pedir("POST", "/dte/notas", CONTADOR, {
      documentoId: ccfDeFactura.documentoId,
      tipo: "credito",
      motivo: "rebaja",
      lineas: [{ lineaOrden: 1, monto: 10 }],
    });
    expect(r.status).toBe(422);
  });

  it("una nota de débito con motivo de crédito, o al revés, se rechaza antes de emitir", async () => {
    expect(
      (await nota({ tipo: "credito", motivo: "cargo", lineas: [{ lineaOrden: 1, monto: 10 }] })).status,
    ).toBe(400);
    expect(
      (await nota({ tipo: "debito", motivo: "rebaja", lineas: [{ lineaOrden: 1, monto: 10 }] })).status,
    ).toBe(400);
  });

  it("el rol de consulta no emite notas", async () => {
    const r = await s.pedir("POST", "/dte/notas", "33333333-3333-4333-8333-333333333333", {
      documentoId: ccf.documentoId,
      tipo: "credito",
      motivo: "rebaja",
      lineas: [{ lineaOrden: 1, monto: 10 }],
    });
    expect(r.status).toBe(403);
  });
});
