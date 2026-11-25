// Registro de compras (HU-59, S3-T61 y S3-T63): kardex, IVA, retención, cuentas por pagar y partida en borrador.
// Usa una base propia (contable_api_compras) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DocumentoComercialVista, KardexVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";
const CONTADOR_GRANDE = "55555555-5555-4555-8555-555555555555";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let grande: EmpresaComercial;
let ajena: EmpresaComercial;
let proveedorId: string;
let soloClienteId: string;
let sinNrcId: string;
let productoId: string;
let cajaId: string;

async function pedir(
  metodo: string,
  ruta: string,
  usuario: string | null,
  cuerpo?: unknown,
  empresa = emp.empresaId,
) {
  const r = await fetch(`${url}/empresas/${empresa}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const tercero = async (cuerpo: Record<string, unknown>, empresa = emp.empresaId, usuario = CONTADOR) => {
  const r = await pedir("POST", "/terceros", usuario, cuerpo, empresa);
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo["id"] as string;
};

const compra = (extra: Record<string, unknown> = {}) => ({
  sucursalId: emp.sucursalId,
  tipoDocumento: "ccf",
  numeroDocumento: "CCF-P001",
  fecha: "2026-10-04",
  terceroId: proveedorId,
  condicionPago: "contado",
  cuentaPagoId: cajaId,
  lineas: [{ productoId, cantidad: 8, precioUnitario: 590 }],
  ...extra,
});

const lineasPartida = async (partidaId: string) =>
  (
    await c.query(
      `select cu.codigo, d.debe::text, d.haber::text from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
       where d.partida_id = $1 order by d.orden`,
      [partidaId],
    )
  ).rows.map((f) => [f.codigo, f.debe, f.haber]);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_compras");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-5");
  grande = await crearEmpresaComercial(c, "0614-010190-102-0", "grande");
  ajena = await crearEmpresaComercial(c, "0614-150390-101-8");
  await crearUsuario(c, CONTADOR, 2, emp);
  await crearUsuario(c, AUXILIAR, 3, emp, [emp.sucursalId]);
  await crearUsuario(c, CONSULTA, 4, emp, [emp.sucursalId]);
  await crearUsuario(c, FORASTERO, 2, ajena);
  await crearUsuario(c, CONTADOR_GRANDE, 2, grande);
  cajaId = await emp.cuenta("110101");

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

  proveedorId = await tercero({
    nombre: "Totalynk El Salvador",
    nit: "1234-567890-123-0",
    nrc: "123456-7",
    esProveedor: true,
    diasCredito: 30,
  });
  soloClienteId = await tercero({
    nombre: "Cliente",
    nit: "0000-000000-104-0",
    nrc: "111111-1",
    esCliente: true,
  });
  sinNrcId = await tercero({ nombre: "Sin NRC", nit: "0000-000000-011-5", esProveedor: true });
  const p = await pedir("POST", "/productos", CONTADOR, {
    codigo: "CP-01",
    nombre: "Samsung Galaxy S24 256 GB",
  });
  expect(p.status).toBe(201);
  productoId = p.cuerpo["id"] as string;
}, 60_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("compra al contado con CCF", () => {
  let doc: DocumentoComercialVista;

  it("registra el documento con su IVA, entra al kardex y genera la partida en borrador", async () => {
    const r = await pedir("POST", "/compras", AUXILIAR, compra());
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({
      operacion: "compra",
      tipoDocumento: "ccf",
      numeroDocumento: "CCF-P001",
      condicionPago: "contado",
      totalGravado: "4720.00",
      iva: "613.60",
      ivaRetenido: "0.00",
      ivaPercibido: "0.00",
      total: "5333.60",
      totalNeto: "5333.60",
      estadoPartida: "borrador",
      fechaVencimiento: null,
    });
    expect(doc.tercero).toMatchObject({ nombre: "Totalynk El Salvador", nrc: "123456-7" });
    expect(doc.lineas[0]).toMatchObject({
      cantidad: "8.0000",
      precioUnitario: "590.0000",
      monto: "4720.00",
      costoKardex: "4720.00",
    });
    expect(await lineasPartida(doc.partidaId)).toEqual([
      ["1109", "4720.00", "0.00"],
      ["1112", "613.60", "0.00"],
      ["110101", "0.00", "5333.60"],
    ]);
  });

  it("la partida enlaza el documento, queda en borrador y se puede contabilizar porque cuadra", async () => {
    const [p] = (
      await c.query(
        `select estado, origen, origen_id, documento_tipo, documento_numero, creado_por from partidas where id = $1`,
        [doc.partidaId],
      )
    ).rows;
    expect(p).toMatchObject({
      estado: "borrador",
      origen: "compras",
      origen_id: doc.id,
      documento_tipo: "CCF",
      documento_numero: "CCF-P001",
      creado_por: AUXILIAR,
    });
    await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [doc.partidaId]);
    const [e] = (await c.query(`select estado, numero from partidas where id = $1`, [doc.partidaId])).rows;
    expect(e.estado).toBe("contabilizada");
    expect(e.numero).not.toBeNull();
  });

  it("el kardex recibe la entrada con el costo del documento y su referencia", async () => {
    const k = await pedir("GET", `/productos/${productoId}/kardex?sucursalId=${emp.sucursalId}`, CONTADOR);
    expect(k.status).toBe(200);
    const kardex = k.cuerpo as unknown as KardexVista;
    expect(kardex.totales).toMatchObject({ entradaCantidad: "8.0000", entradaTotal: "4720.00" });
    const [m] = (
      await c.query(
        `select referencia, tipo::text, costo_unitario::text from movimientos_inventario where producto_id = $1`,
        [productoId],
      )
    ).rows;
    expect(m).toMatchObject({ referencia: "CCF-P001", tipo: "entrada", costo_unitario: "590.0000" });
  });

  it("se consulta por la lista y por su id", async () => {
    const lista = (await pedir("GET", "/compras?busqueda=totalynk", CONSULTA))
      .cuerpo as unknown as DocumentoComercialVista[];
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: doc.id, total: "5333.60", estadoPartida: "contabilizada" });
    expect(lista[0]).not.toHaveProperty("lineas");
    expect((await pedir("GET", `/compras/${doc.id}`, CONSULTA)).cuerpo).toMatchObject({ id: doc.id });
    expect(
      (await pedir("GET", "/compras?desde=2026-11-01", CONSULTA)).cuerpo as unknown as unknown[],
    ).toHaveLength(0);
  });
});

describe("compra al crédito", () => {
  it("queda en cuentas por pagar con su fecha de vencimiento (plazo del proveedor)", async () => {
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({
        numeroDocumento: "CCF-P002",
        condicionPago: "credito",
        cuentaPagoId: undefined,
        lineas: [{ productoId, cantidad: 2, precioUnitario: 600.5 }],
      }),
    );
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({
      condicionPago: "credito",
      diasCredito: 30,
      fechaVencimiento: "2026-11-03",
      total: "1357.13",
      cuentaPagoId: null,
    });
    expect(await lineasPartida(doc.partidaId)).toEqual([
      ["1109", "1201.00", "0.00"],
      ["1112", "156.13", "0.00"],
      ["210201", "0.00", "1357.13"],
    ]);
  });

  it("acepta un plazo propio", async () => {
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({
        numeroDocumento: "CCF-P003",
        condicionPago: "credito",
        diasCredito: 15,
        cuentaPagoId: undefined,
        fecha: "2026-10-05",
        lineas: [{ productoId, cantidad: 1, precioUnitario: 590 }],
      }),
    );
    expect(r.cuerpo).toMatchObject({ diasCredito: 15, fechaVencimiento: "2026-10-20" });
  });
});

describe("otras formas de compra", () => {
  it("una factura no da crédito fiscal: el IVA se queda en el costo", async () => {
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({
        tipoDocumento: "factura",
        numeroDocumento: "F-0001",
        fecha: "2026-10-06",
        lineas: [{ productoId, cantidad: 1, precioUnitario: 113 }],
      }),
    );
    const doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({ iva: "0.00", totalGravado: "113.00", total: "113.00" });
    expect(await lineasPartida(doc.partidaId)).toEqual([
      ["1109", "113.00", "0.00"],
      ["110101", "0.00", "113.00"],
    ]);
  });

  it("un gasto sin producto va a la cuenta elegida y no mueve el kardex", async () => {
    const gasto =
      ((await c.query(`select id from cuentas where empresa_id = $1 and codigo = '420134'`, [emp.empresaId]))
        .rows[0]?.id as string | undefined) ??
      ((
        await c.query(
          `select c.id from cuentas c where c.empresa_id = $1 and c.codigo like '42%'
         and not exists (select 1 from cuentas h where h.cuenta_padre_id = c.id) order by c.codigo limit 1`,
          [emp.empresaId],
        )
      ).rows[0].id as string);
    const antes = (await c.query(`select count(*)::int n from movimientos_inventario`)).rows[0].n as number;
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({
        numeroDocumento: "CCF-P010",
        fecha: "2026-10-07",
        lineas: [{ cuentaId: gasto, descripcion: "Alquiler de octubre", cantidad: 1, precioUnitario: 600 }],
      }),
    );
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({ iva: "78.00", total: "678.00" });
    expect(doc.lineas[0]).toMatchObject({
      productoId: null,
      descripcion: "Alquiler de octubre",
      costoKardex: null,
    });
    expect((await lineasPartida(doc.partidaId))[0]![1]).toBe("600.00");
    expect((await c.query(`select count(*)::int n from movimientos_inventario`)).rows[0].n).toBe(antes);
  });

  it("separa lo exento del gravado en el documento", async () => {
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({
        numeroDocumento: "CCF-P011",
        fecha: "2026-10-08",
        lineas: [
          { productoId, cantidad: 1, precioUnitario: 100 },
          { productoId, cantidad: 1, precioUnitario: 50, clase: "exenta" },
        ],
      }),
    );
    expect(r.cuerpo).toMatchObject({
      totalGravado: "100.00",
      totalExento: "50.00",
      iva: "13.00",
      total: "163.00",
    });
  });
});

describe("retención y percepción del 1 % de IVA", () => {
  it("una empresa gran contribuyente retiene al proveedor: paga el total menos la retención", async () => {
    const prov = await tercero(
      { nombre: "Proveedor pequeño", nit: "1234-567890-123-0", nrc: "222222-2", esProveedor: true },
      grande.empresaId,
      CONTADOR_GRANDE,
    );
    const prod = (
      await pedir("POST", "/productos", CONTADOR_GRANDE, { codigo: "X-1", nombre: "X" }, grande.empresaId)
    ).cuerpo["id"] as string;
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR_GRANDE,
      {
        sucursalId: grande.sucursalId,
        tipoDocumento: "ccf",
        numeroDocumento: "CCF-G001",
        fecha: "2026-10-04",
        terceroId: prov,
        condicionPago: "contado",
        cuentaPagoId: await grande.cuenta("110101"),
        lineas: [{ productoId: prod, cantidad: 10, precioUnitario: 100 }],
      },
      grande.empresaId,
    );
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({
      iva: "130.00",
      ivaRetenido: "10.00",
      total: "1130.00",
      totalNeto: "1120.00",
    });
    expect(await lineasPartida(doc.partidaId)).toEqual([
      ["1109", "1000.00", "0.00"],
      ["1112", "130.00", "0.00"],
      ["110101", "0.00", "1120.00"],
      ["211002", "0.00", "10.00"],
    ]);
  });

  it("un proveedor gran contribuyente percibe el 1 %: se suma al documento y queda como IVA pagado por anticipado", async () => {
    const prov = await tercero({
      nombre: "Proveedor grande",
      nit: "1000-000000-009-0",
      nrc: "333333-3",
      esProveedor: true,
      clasificacion: "grande",
    });
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({
        terceroId: prov,
        numeroDocumento: "CCF-P020",
        fecha: "2026-10-09",
        lineas: [{ productoId, cantidad: 1, precioUnitario: 500 }],
      }),
    );
    const doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({ ivaPercibido: "5.00", total: "570.00", totalNeto: "570.00" });
    expect(await lineasPartida(doc.partidaId)).toEqual([
      ["1109", "500.00", "0.00"],
      ["1112", "65.00", "0.00"],
      ["111301", "5.00", "0.00"],
      ["110101", "0.00", "570.00"],
    ]);
  });
});

describe("validaciones", () => {
  it("no registra dos veces el mismo documento del mismo proveedor y no deja huella en el kardex", async () => {
    const antes = (await c.query(`select count(*)::int n from movimientos_inventario`)).rows[0].n as number;
    const r = await pedir("POST", "/compras", CONTADOR, compra());
    expect(r.status).toBe(409);
    expect(r.cuerpo["message"]).toMatch(/CCF-P001/);
    expect((await c.query(`select count(*)::int n from movimientos_inventario`)).rows[0].n).toBe(antes);
  });

  it("exige que el tercero sea un proveedor activo y, para un CCF, que tenga NRC", async () => {
    const cliente = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({ terceroId: soloClienteId, numeroDocumento: "X-1" }),
    );
    expect(cliente.status).toBe(422);
    expect(cliente.cuerpo["message"]).toMatch(/no es un proveedor/);
    const sinNrc = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({ terceroId: sinNrcId, numeroDocumento: "X-2" }),
    );
    expect(sinNrc.status).toBe(422);
    expect(sinNrc.cuerpo["message"]).toMatch(/NRC/);
    // con factura no hace falta el NRC
    const factura = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({
        terceroId: sinNrcId,
        tipoDocumento: "factura",
        numeroDocumento: "X-3",
        fecha: "2026-10-10",
        lineas: [{ productoId, cantidad: 1, precioUnitario: 10 }],
      }),
    );
    expect(factura.status, JSON.stringify(factura.cuerpo)).toBe(201);
  });

  it("una línea con cuenta de inventarios (1109) o de efectivo (1101) se rechaza: se saltaría el kardex", async () => {
    const antes = (await c.query(`select count(*)::int n from documentos_comerciales`)).rows[0].n as number;
    for (const codigo of ["1109", "110101"]) {
      const cuentaId = await emp.cuenta(codigo);
      const r = await pedir(
        "POST",
        "/compras",
        CONTADOR,
        compra({
          numeroDocumento: `INV-${codigo}`,
          lineas: [{ cuentaId, descripcion: "Mercadería sin kardex", cantidad: 1, precioUnitario: 100 }],
        }),
      );
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(422);
      expect(JSON.stringify(r.cuerpo)).toMatch(/inventarios|caja o bancos/);
    }
    expect((await c.query(`select count(*)::int n from documentos_comerciales`)).rows[0].n).toBe(antes);
  });

  it("valida el cuerpo: línea con producto y cuenta a la vez, sin líneas y contado sin caja", async () => {
    const cuenta = await emp.cuenta("110101");
    expect(
      (
        await pedir(
          "POST",
          "/compras",
          CONTADOR,
          compra({
            numeroDocumento: "V-1",
            lineas: [{ productoId, cuentaId: cuenta, cantidad: 1, precioUnitario: 1 }],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await pedir("POST", "/compras", CONTADOR, compra({ numeroDocumento: "V-2", lineas: [] }))).status,
    ).toBe(400);
    expect(
      (await pedir("POST", "/compras", CONTADOR, compra({ numeroDocumento: "V-3", cuentaPagoId: undefined })))
        .status,
    ).toBe(400);
    expect(
      (await pedir("POST", "/compras", CONTADOR, compra({ numeroDocumento: "V-4", terceroId: undefined })))
        .status,
    ).toBe(400);
  });

  it("el pago al contado debe ser una cuenta de efectivo", async () => {
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({ numeroDocumento: "V-5", cuentaPagoId: await emp.cuenta("4101") }),
    );
    expect(r.status).toBe(422);
    expect(r.cuerpo["message"]).toMatch(/caja o banco/);
  });

  it("una fecha anterior al último movimiento del producto se rechaza y no se guarda nada", async () => {
    const docs = (await c.query(`select count(*)::int n from documentos_comerciales`)).rows[0].n as number;
    const partidas = (await c.query(`select count(*)::int n from partidas`)).rows[0].n as number;
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({ numeroDocumento: "V-6", fecha: "2026-09-01" }),
    );
    expect(r.status).toBe(422);
    expect((await c.query(`select count(*)::int n from documentos_comerciales`)).rows[0].n).toBe(docs);
    expect((await c.query(`select count(*)::int n from partidas`)).rows[0].n).toBe(partidas);
  });

  it("un período cerrado no admite la compra y deja todo como estaba", async () => {
    await c.query(`update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 12`, [
      emp.empresaId,
    ]);
    const movimientos = (await c.query(`select count(*)::int n from movimientos_inventario`)).rows[0]
      .n as number;
    const r = await pedir(
      "POST",
      "/compras",
      CONTADOR,
      compra({ numeroDocumento: "V-7", fecha: "2026-12-10" }),
    );
    expect(r.status).toBe(422);
    expect(r.cuerpo["message"]).toMatch(/cerrado/);
    expect((await c.query(`select count(*)::int n from movimientos_inventario`)).rows[0].n).toBe(movimientos);
  });
});

describe("permisos y alcance", () => {
  it("consulta ve las compras pero no las registra; quien no es miembro no entra", async () => {
    expect((await pedir("POST", "/compras", CONSULTA, compra({ numeroDocumento: "P-1" }))).status).toBe(403);
    expect((await pedir("GET", "/compras", CONSULTA)).status).toBe(200);
    expect((await pedir("GET", "/compras", FORASTERO)).status).toBe(404);
    expect((await pedir("GET", "/compras", null)).status).toBe(401);
  });

  it("el auxiliar solo registra en sus sucursales y las compras de otra empresa no se ven", async () => {
    const r = await pedir(
      "POST",
      "/compras",
      AUXILIAR,
      compra({ numeroDocumento: "P-2", sucursalId: emp.otraSucursalId }),
    );
    expect(r.status).toBe(403);
    const lista = (await pedir("GET", "/compras", FORASTERO, undefined, ajena.empresaId))
      .cuerpo as unknown as unknown[];
    expect(lista).toHaveLength(0);
  });

  it("la bitácora registra al usuario que hizo la compra", async () => {
    const b = await c.query(
      `select usuario_id from bitacora where tabla = 'documentos_comerciales' and accion = 'INSERT' order by id limit 1`,
    );
    expect(b.rows[0].usuario_id).toBe(AUXILIAR);
  });
});
