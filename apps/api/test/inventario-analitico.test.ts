// HU-69: el costo periódico usa las partidas de compras y la toma física final, y coincide con el kardex CheroPhonex.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type KardexVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerCaso } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const caso = leerCaso();
const esperado = caso.esperado.inventario;
const costoDeVentasEsperado = Dinero.de(esperado.costoDeVentas).aTexto();
const existenciasFinalesEsperadas = Dinero.de(esperado.existenciasFinales).aTexto();

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let empresaId: string;
let sucursalId: string;
let cuentas: Record<string, string>;

async function pedir(metodo: string, ruta: string, cuerpo?: unknown, usuarioId = CONTADOR) {
  const respuesta = await fetch(url + "/empresas/" + empresaId + ruta, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + usuarioId,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

async function crearPartida(
  fecha: string,
  lineas: { codigo: string; debe: string; haber: string }[],
  publicar: boolean,
) {
  const borrador = await pedir("POST", "/partidas", {
    sucursalId,
    fecha,
    tipo: "operacion",
    concepto: "Registro analítico de prueba",
    lineas: lineas.map((linea) => ({
      cuentaId: cuentas[linea.codigo],
      debe: linea.debe,
      haber: linea.haber,
    })),
  });
  expect(borrador.status).toBe(201);
  if (publicar) {
    const borradorId = borrador.cuerpo["id"] as string;
    const contabilizada = await pedir("POST", "/partidas/" + borradorId + "/contabilizar");
    expect(contabilizada.status).toBe(200);
  }
  return borrador.cuerpo["id"] as string;
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_inventario_analitico");
  c = await reiniciarBase(urlBase);
  const empresa = await c.query(
    "insert into empresas (nombre, nit, tipo_contribuyente, sistema_inventario) values ('CheroPhonex analítico', '0614-680901-101-1', 'persona_natural', 'analitico') returning id",
  );
  empresaId = empresa.rows[0].id as string;
  const sucursal = await c.query(
    "insert into sucursales (empresa_id, nombre, codigo_establecimiento, es_matriz) values ($1, 'Casa matriz', 'M001', true) returning id",
    [empresaId],
  );
  sucursalId = sucursal.rows[0].id as string;
  await c.query(
    "insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2026, '2026-01-01', '2026-12-31')",
    [empresaId],
  );
  await c.query("select interno.copiar_catalogo_base($1)", [empresaId]);
  const catalogo = await c.query("select codigo, id::text from cuentas where empresa_id = $1", [empresaId]);
  cuentas = Object.fromEntries(catalogo.rows.map((fila) => [fila.codigo, fila.id]));

  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Contador de prueba', 'analitico@test.local')",
    [CONTADOR],
  );
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, empresaId],
  );

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
}, 120_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("GET /empresas/:empresaId/inventario-analitico (HU-69)", () => {
  it("calcula el cierre con partidas y una toma física, y coincide con el kardex de CheroPhonex", async () => {
    await crearPartida(
      "2026-10-04",
      [
        { codigo: "4101", debe: "40000.00", haber: "0.00" },
        { codigo: "110101", debe: "0.00", haber: "40000.00" },
      ],
      true,
    );
    await crearPartida(
      "2026-10-05",
      [
        { codigo: "4102", debe: "1000.00", haber: "0.00" },
        { codigo: "5102", debe: "0.00", haber: "1000.00" },
      ],
      true,
    );
    await crearPartida(
      "2026-10-06",
      [
        { codigo: "4101", debe: "900.00", haber: "0.00" },
        { codigo: "110101", debe: "0.00", haber: "900.00" },
      ],
      false,
    );

    const productos = new Map<string, string>();
    for (const [indice, p] of caso.inventario.entries()) {
      const creado = await pedir("POST", "/productos", {
        codigo: "AN-" + String(indice + 1).padStart(2, "0"),
        nombre: p.nombre,
        metodoValuacion: "promedio_ponderado",
      });
      expect(creado.status, p.nombre).toBe(201);
      productos.set(p.codigo, creado.cuerpo["id"] as string);
      const base = { productoId: creado.cuerpo["id"], sucursalId };
      const compra = await pedir("POST", "/movimientos-inventario", {
        ...base,
        tipo: "entrada",
        cantidad: p.compra.cantidad,
        costoUnitario: p.compra.costoUnitario,
        fecha: p.compra.fecha,
      });
      expect(compra.status, p.nombre).toBe(201);
      for (const venta of p.ventas) {
        const salida = await pedir("POST", "/movimientos-inventario", {
          ...base,
          tipo: "salida",
          cantidad: venta.cantidad,
          fecha: venta.fecha,
        });
        expect(salida.status, p.nombre + " " + venta.fecha).toBe(201);
      }
    }

    const kardexes: KardexVista[] = [];
    for (const productoId of productos.values()) {
      const respuesta = await pedir("GET", "/productos/" + productoId + "/kardex?sucursalId=" + sucursalId);
      expect(respuesta.status).toBe(200);
      kardexes.push(respuesta.cuerpo as unknown as KardexVista);
    }
    const costoPerpetuo = Dinero.sumar(kardexes.map((kardex) => kardex.totales.salidaTotal)).aTexto();
    const finalPerpetuo = Dinero.sumar(kardexes.map((kardex) => kardex.saldoFinal.costoTotal)).aTexto();
    expect(costoPerpetuo).toBe(costoDeVentasEsperado);
    expect(finalPerpetuo).toBe(existenciasFinalesEsperadas);

    const iniciada = await pedir("POST", "/tomas-fisicas", { sucursalId, fecha: "2026-10-31" });
    expect(iniciada.status).toBe(201);
    const tomaId = iniciada.cuerpo["id"] as string;
    const conteo = await pedir("PATCH", "/tomas-fisicas/" + tomaId + "/conteo", {
      lineas: kardexes.map((kardex) => ({
        productoId: kardex.productoId,
        cantidadContada: kardex.saldoFinal.cantidad,
      })),
    });
    expect(conteo.status).toBe(200);
    const aprobada = await pedir("POST", "/tomas-fisicas/" + tomaId + "/aprobar", {});
    expect(aprobada.status).toBe(201);

    const reporte = await pedir("GET", "/inventario-analitico?desde=2026-10-01&hasta=2026-10-31");
    expect(reporte.status).toBe(200);
    expect(reporte.cuerpo).toMatchObject({
      desde: "2026-10-01",
      hasta: "2026-10-31",
      sucursalId: null,
      inventarioInicial: "0.00",
      compras: "40000.00",
      gastosSobreCompras: "1000.00",
      devolucionesYRebajas: "1000.00",
      comprasNetas: "40000.00",
      inventarioFinal: existenciasFinalesEsperadas,
      costoVentas: costoDeVentasEsperado,
      inventarioFinalPorSucursal: [
        {
          sucursalId,
          sucursal: "Casa matriz",
          fechaToma: "2026-10-31",
          valor: existenciasFinalesEsperadas,
        },
      ],
    });
  }, 120_000);

  it("no calcula costo si no hay toma final y valida el rango de fechas", async () => {
    const sinFinal = await pedir("GET", "/inventario-analitico?desde=2026-09-01&hasta=2026-09-30");
    expect(sinFinal.status).toBe(200);
    expect(sinFinal.cuerpo).toMatchObject({
      inventarioFinal: null,
      costoVentas: null,
      inventarioFinalPorSucursal: [{ sucursalId, sucursal: "Casa matriz", fechaToma: null, valor: null }],
    });

    const rangoInvalido = await pedir("GET", "/inventario-analitico?desde=2026-10-31&hasta=2026-10-01");
    expect(rangoInvalido.status).toBe(400);

    const otraSucursal = await c.query(
      "insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal auxiliar', 'S002') returning id",
      [empresaId],
    );
    await c.query(
      "insert into usuarios (id, nombre, correo) values ($1, 'Auxiliar', 'auxiliar@test.local')",
      [AUXILIAR],
    );
    const membresia = await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 3, false) returning id",
      [AUXILIAR, empresaId],
    );
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
      membresia.rows[0].id,
      sucursalId,
    ]);
    const limitado = await pedir(
      "GET",
      "/inventario-analitico?desde=2026-10-01&hasta=2026-10-31",
      undefined,
      AUXILIAR,
    );
    expect(limitado.status).toBe(200);
    expect(limitado.cuerpo["inventarioFinalPorSucursal"]).toMatchObject([
      { sucursalId, sucursal: "Casa matriz", valor: existenciasFinalesEsperadas },
    ]);

    const fueraDeAlcance = await pedir(
      "GET",
      "/inventario-analitico?desde=2026-10-01&hasta=2026-10-31&sucursalId=" + otraSucursal.rows[0].id,
      undefined,
      AUXILIAR,
    );
    expect(fueraDeAlcance.status).toBe(403);
  });
});
