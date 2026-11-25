// Compras contra el caso CheroPhonex (HU-59, S3-T63): la compra de octubre (CCF por US$ 40,000.00 más IVA de
// US$ 5,200.00) debe generar la partida y las entradas del kardex que traen los libros de la clase.
//
// Diferencia con el libro: el ejercicio paga US$ 18,000.00 con cheque y deja el resto al crédito; aquí el documento
// se registra completo al crédito y el pago de US$ 18,000.00 se reproduce como abono el mismo día (HU-62).
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type AbonoVista, type DocumentoComercialVista, type KardexVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerCaso } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const caso = leerCaso();
const partidaCompra = caso.partidas.find((p) => p.numero === 3)!;
const monto = (cuenta: string, lado: "debe" | "haber") =>
  Dinero.sumar(partidaCompra.lineas.filter((l) => l.cuenta === cuenta).map((l) => l[lado])).aTexto();

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let documento: DocumentoComercialVista;
let pagoInicial: AbonoVista;
let proveedorId: string;
const productos = new Map<string, string>();

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${emp.empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${CONTADOR}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_compras_cherophonex");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, caso.empresa.nit);
  await crearUsuario(c, CONTADOR, 2, emp);

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();

  const proveedor = await pedir("POST", "/terceros", {
    nombre: "Totalynk El Salvador",
    nit: "1234-567890-123-0",
    nrc: "123456-7",
    esProveedor: true,
  });
  expect(proveedor.status).toBe(201);
  for (const p of caso.inventario) {
    const creado = await pedir("POST", "/productos", { codigo: p.codigo, nombre: p.nombre });
    expect(creado.status, p.nombre).toBe(201);
    productos.set(p.codigo, creado.cuerpo["id"] as string);
  }
  proveedorId = proveedor.cuerpo["id"] as string;
  const r = await pedir("POST", "/compras", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: "CCF-OCT-001",
    fecha: partidaCompra.fecha,
    terceroId: proveedor.cuerpo["id"],
    condicionPago: "credito",
    lineas: caso.inventario.map((p) => ({
      productoId: productos.get(p.codigo),
      cantidad: p.compra.cantidad,
      precioUnitario: p.compra.costoUnitario,
    })),
  });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  documento = r.cuerpo as unknown as DocumentoComercialVista;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("compra de octubre de CheroPhonex", () => {
  it("el documento trae el valor, el IVA y el total del libro", () => {
    expect(documento.lineas).toHaveLength(23);
    expect(documento.totalGravado).toBe(monto("1109", "debe"));
    expect(documento.iva).toBe(monto("1112", "debe"));
    expect(documento.total).toBe("45200.00");
  });

  it("la partida en borrador carga inventario y crédito fiscal como el libro, y el resto a cuentas por pagar", async () => {
    const lineas = (
      await c.query(
        `select cu.codigo, d.debe::text, d.haber::text from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
         where d.partida_id = $1 order by d.orden`,
        [documento.partidaId],
      )
    ).rows.map((f) => [f.codigo, f.debe, f.haber]);
    expect(lineas).toEqual([
      ["1109", monto("1109", "debe"), "0.00"],
      ["1112", monto("1112", "debe"), "0.00"],
      ["210201", "0.00", Dinero.sumar(["18000.00", monto("210201", "haber")]).aTexto()],
    ]);
  });

  it("el kardex de cada producto recibe las unidades y el costo de la compra", async () => {
    const kardexes: KardexVista[] = [];
    for (const p of caso.inventario) {
      const r = await pedir(
        "GET",
        `/productos/${productos.get(p.codigo)}/kardex?sucursalId=${emp.sucursalId}`,
      );
      expect(r.status, p.nombre).toBe(200);
      const k = r.cuerpo as unknown as KardexVista;
      expect(k.totales.entradaCantidad, p.nombre).toBe(`${p.compra.cantidad}.0000`);
      expect(k.totales.entradaTotal, p.nombre).toBe(
        Dinero.de(p.compra.costoUnitario).por(p.compra.cantidad).aTexto(),
      );
      kardexes.push(k);
    }
    expect(kardexes.reduce((a, k) => a + Number(k.totales.entradaCantidad), 0)).toBe(
      caso.esperado.inventario.unidadesCompradas,
    );
    expect(Dinero.sumar(kardexes.map((k) => k.totales.entradaTotal)).aTexto()).toBe("40000.00");
  });

  it("la partida se contabiliza y el inventario queda con el valor comprado", async () => {
    await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [documento.partidaId]);
    const [saldo] = (
      await c.query(
        `select sum(d.debe - d.haber)::text s from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
         join partidas p on p.id = d.partida_id where cu.codigo = '1109' and cu.empresa_id = $1 and p.estado = 'contabilizada'`,
        [emp.empresaId],
      )
    ).rows;
    expect(Dinero.de(saldo.s).aTexto()).toBe("40000.00");
  });
});

describe("pago de US$ 18,000.00 como abono (HU-62)", () => {
  it("el abono del mismo día con cheque deja las cuentas por pagar como el libro", async () => {
    const banco = await emp.cuenta("11010301");
    const r = await pedir("POST", "/abonos", {
      operacion: "compra",
      sucursalId: emp.sucursalId,
      terceroId: proveedorId,
      fecha: partidaCompra.fecha,
      cuentaPagoId: banco,
      referencia: "CHEQUE-0002",
      aplicaciones: [{ documentoId: documento.id, monto: "18000.00" }],
    });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    pagoInicial = r.cuerpo as unknown as AbonoVista;
    expect(pagoInicial).toMatchObject({ monto: "18000.00", estadoPartida: "borrador" });
    const lineas = (
      await c.query(
        `select cu.codigo, d.debe::text, d.haber::text from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
         where d.partida_id = $1 order by d.orden`,
        [pagoInicial.partidaId],
      )
    ).rows.map((f) => [f.codigo, f.debe, f.haber]);
    expect(lineas).toEqual([
      ["210201", "18000.00", "0.00"],
      ["11010301", "0.00", "18000.00"],
    ]);
  });

  it("compra más abono suman el asiento 3 del libro: banco y cuentas por pagar quedan igual", async () => {
    await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [pagoInicial.partidaId]);
    const saldo = async (codigo: string) =>
      (
        await c.query(
          `select coalesce(sum(d.debe - d.haber), 0)::text s from partida_detalles d
           join cuentas cu on cu.id = d.cuenta_id join partidas p on p.id = d.partida_id
           where cu.codigo = $1 and cu.empresa_id = $2 and p.estado in ('contabilizada', 'anulada')`,
          [codigo, emp.empresaId],
        )
      ).rows[0].s as string;
    // El libro acredita el banco por 18,000.00 y las cuentas por pagar por 27,200.00 (13,334.00 + 13,243.60 + 622.40)
    expect(Dinero.de(await saldo("11010301")).aTexto()).toBe("-18000.00");
    expect(Dinero.de(await saldo("210201")).aTexto()).toBe("-27200.00");
    const pendiente = (await pedir("GET", "/abonos/pendientes?operacion=compra")).cuerpo as unknown as {
      id: string;
      saldo: string;
      abonado: string;
    }[];
    expect(pendiente.find((p) => p.id === documento.id)).toMatchObject({
      abonado: "18000.00",
      saldo: "27200.00",
    });
  });
});
