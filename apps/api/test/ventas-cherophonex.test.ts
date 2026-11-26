// Ventas contra el caso CheroPhonex (HU-60, S3-T66): las partidas de venta y de costo de ventas de octubre deben
// coincidir al centavo con las del libro diario, y el inventario final con el del ejercicio.
//
// El libro no trae el detalle por documento, solo el total de cada día: las unidades que salen del kardex se
// registran en un CCF por fecha (con los precios repartidos para sumar el ingreso a contribuyentes del día) y las
// facturas de consumidor final del día como un resumen con su cuenta de ingreso. Así se comparan los totales por
// cuenta y por fecha, no el detalle por documento.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerCaso } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const caso = leerCaso();

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
const productos = new Map<string, string>();

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${emp.empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${CONTADOR}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

/** Ingresos y costo del libro por fecha: partidas operativas con ventas (510101, 510102) o costo de ventas. */
const ventasDelLibro = caso.partidas
  .filter((p) => p.tipo === "operacion" && p.lineas.some((l) => l.cuenta === "510101" || l.cuenta === "4104"))
  .reduce(
    (acc, p) => {
      const dia = (acc[p.fecha] ??= {
        contribuyentes: "0.00",
        consumidor: "0.00",
        iva: "0.00",
        costo: "0.00",
      });
      const suma = (cuenta: string, lado: "debe" | "haber") =>
        Dinero.sumar(p.lineas.filter((l) => l.cuenta === cuenta).map((l) => l[lado]));
      dia.contribuyentes = Dinero.de(dia.contribuyentes).mas(suma("510101", "haber")).aTexto();
      dia.consumidor = Dinero.de(dia.consumidor).mas(suma("510102", "haber")).aTexto();
      dia.iva = Dinero.de(dia.iva).mas(suma("2109", "haber")).aTexto();
      dia.costo = Dinero.de(dia.costo).mas(suma("4104", "debe")).aTexto();
      return acc;
    },
    {} as Record<string, { contribuyentes: string; consumidor: string; iva: string; costo: string }>,
  );
const fechas = Object.keys(ventasDelLibro).sort();

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_ventas_cherophonex");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, caso.empresa.nit);
  await crearUsuario(c, CONTADOR, 2, emp);
  // Como el catálogo del caso: las ventas se separan en contribuyentes y consumidor final
  for (const [codigo, nombre] of [
    ["510101", "Ventas a contribuyentes"],
    ["510102", "Ventas a consumidor final"],
  ] as const) {
    await c.query(
      `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, 'acreedora', 'ingresos')`,
      [emp.empresaId, codigo, nombre],
    );
  }

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
  const cliente = await pedir("POST", "/terceros", {
    nombre: "Tecno Plaza San Miguel",
    nit: "0000-000000-104-0",
    nrc: "111111-1",
    esCliente: true,
  });
  for (const p of caso.inventario) {
    const creado = await pedir("POST", "/productos", { codigo: p.codigo, nombre: p.nombre });
    productos.set(p.codigo, creado.cuerpo["id"] as string);
  }
  const compra = await pedir("POST", "/compras", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: "CCF-OCT-001",
    fecha: "2026-10-04",
    terceroId: proveedor.cuerpo["id"],
    condicionPago: "credito",
    lineas: caso.inventario.map((p) => ({
      productoId: productos.get(p.codigo),
      cantidad: p.compra.cantidad,
      precioUnitario: p.compra.costoUnitario,
    })),
  });
  expect(compra.status, JSON.stringify(compra.cuerpo)).toBe(201);
  const ingresoConsumidor = await emp.cuenta("510102");
  const caja = await emp.cuenta("110101");

  let n = 0;
  for (const fecha of fechas) {
    const dia = ventasDelLibro[fecha]!;
    // Unidades vendidas ese día, por producto
    const unidades = caso.inventario
      .map((p) => ({
        p,
        cantidad: p.ventas.filter((v) => v.fecha === fecha).reduce((a, v) => a + v.cantidad, 0),
      }))
      .filter((u) => u.cantidad > 0);
    const total = unidades.reduce((a, u) => a + u.cantidad, 0);
    // El ingreso a contribuyentes se reparte por unidades al centavo; el último producto lleva el residuo
    let restante = Dinero.de(dia.contribuyentes);
    const lineas = unidades.map((u, i) => {
      const parte =
        i === unidades.length - 1 ? restante : Dinero.de(dia.contribuyentes).por(u.cantidad).dividido(total);
      restante = restante.menos(parte);
      return {
        productoId: productos.get(u.p.codigo),
        cantidad: u.cantidad,
        precioUnitario: (Number(parte.aTexto()) / u.cantidad).toFixed(4),
        _parte: parte.aTexto(),
      };
    });
    const r1 = await pedir("POST", "/ventas", {
      sucursalId: emp.sucursalId,
      tipoDocumento: "ccf",
      numeroDocumento: `CCF-${String(++n).padStart(4, "0")}`,
      fecha,
      terceroId: cliente.cuerpo["id"],
      condicionPago: "contado",
      cuentaPagoId: caja,
      lineas: lineas.map(({ _parte, ...l }) => l),
    });
    expect(r1.status, `${fecha} ${JSON.stringify(r1.cuerpo)}`).toBe(201);
    if (!Dinero.de(dia.consumidor).esCero()) {
      const r2 = await pedir("POST", "/ventas", {
        sucursalId: emp.sucursalId,
        tipoDocumento: "factura",
        numeroDocumento: `FCF-${fecha}`,
        numeroDocumentoHasta: `FCF-${fecha}-FIN`,
        fecha,
        condicionPago: "contado",
        cuentaPagoId: caja,
        lineas: [
          {
            cuentaId: ingresoConsumidor,
            descripcion: "Facturas de consumidor final del día",
            cantidad: 1,
            precioUnitario: Dinero.de(dia.consumidor).por("1.13").aTexto(),
          },
        ],
      });
      expect(r2.status, `${fecha} CF ${JSON.stringify(r2.cuerpo)}`).toBe(201);
    }
  }
}, 180_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

const saldoPorFecha = async (codigo: string, fecha: string, lado: "debe" | "haber") =>
  Dinero.de(
    (
      await c.query(
        `select coalesce(sum(d.${lado}), 0)::text s from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
         join partidas p on p.id = d.partida_id where cu.empresa_id = $1 and cu.codigo = $2 and p.fecha = $3
         and p.origen in ('ventas', 'ventas_costo')`,
        [emp.empresaId, codigo, fecha],
      )
    ).rows[0].s,
  ).aTexto();

describe("ventas de octubre de CheroPhonex", () => {
  it.each(fechas)(
    "el %s: ventas, IVA débito y costo de ventas coinciden con el libro diario",
    async (fecha) => {
      const dia = ventasDelLibro[fecha]!;
      expect(await saldoPorFecha("510101", fecha, "haber")).toBe(dia.contribuyentes);
      expect(await saldoPorFecha("510102", fecha, "haber")).toBe(dia.consumidor);
      expect(await saldoPorFecha("2109", fecha, "haber")).toBe(dia.iva);
      expect(await saldoPorFecha("4104", fecha, "debe")).toBe(dia.costo);
    },
  );

  it("el costo de ventas del mes y el inventario final coinciden con el ejercicio", async () => {
    const costo = Dinero.sumar(fechas.map((f) => ventasDelLibro[f]!.costo)).aTexto();
    expect(costo).toBe(Dinero.de(caso.esperado.inventario.costoDeVentas).aTexto());
    const [inv] = (
      await c.query(
        `select (sum(d.debe) - sum(d.haber))::text s from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
         where cu.empresa_id = $1 and cu.codigo = '1109'`,
        [emp.empresaId],
      )
    ).rows;
    expect(Dinero.de(inv.s).aTexto()).toBe(Dinero.de(caso.esperado.inventario.existenciasFinales).aTexto());
  });

  it("todas las partidas generadas cuadran: se pueden contabilizar", async () => {
    const r = await c.query(
      `update partidas set estado = 'contabilizada' where empresa_id = $1 and estado = 'borrador' returning id`,
      [emp.empresaId],
    );
    expect(r.rowCount).toBeGreaterThan(8 * 2);
  });

  it("el IVA débito de todo el mes coincide con el del libro", async () => {
    const libro = Dinero.sumar(fechas.map((f) => ventasDelLibro[f]!.iva)).aTexto();
    const [f] = (
      await c.query(
        `select sum(iva)::text s from documentos_comerciales where empresa_id = $1 and operacion = 'venta'`,
        [emp.empresaId],
      )
    ).rows;
    expect(Dinero.de(f.s).aTexto()).toBe(libro);
  });
});
