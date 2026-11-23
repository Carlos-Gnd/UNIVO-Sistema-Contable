// Kardex contra el caso CheroPhonex (HU-65, S3-T81): el costo de ventas y las existencias del kardex deben
// coincidir al centavo con los libros del ejercicio, con promedio ponderado y con PEPS.
//
// El caso trae, por producto, la compra de octubre y las unidades vendidas por fecha de documento. Esta prueba
// las registra por la API y compara el kardex con las partidas de costo de ventas y con el inventario que
// calcula de forma independiente el modelo del ejercicio.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type KardexVista, type MetodoValuacion } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cargarCasoCherophonex,
  leerCaso,
  type CasoCargado,
} from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const METODOS: MetodoValuacion[] = ["promedio_ponderado", "peps"];

const caso = leerCaso();
const esperado = caso.esperado;

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
const kardexes = {} as Record<MetodoValuacion, KardexVista[]>;

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${carga.empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${CONTADOR}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_kardex_cherophonex");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c);
  await c.query("insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@prueba.sv')", [
    CONTADOR,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, carga.empresaId],
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

  // Cada método usa su propio juego de productos: el método de un producto no cambia con movimientos
  for (const metodo of METODOS) {
    kardexes[metodo] = [];
    for (const p of caso.inventario) {
      const creado = await pedir("POST", "/productos", {
        codigo: `${p.codigo}-${metodo === "peps" ? "PEPS" : "PROM"}`,
        nombre: p.nombre,
        metodoValuacion: metodo,
      });
      expect(creado.status, p.nombre).toBe(201);
      const productoId = creado.cuerpo["id"] as string;
      const base = { productoId, sucursalId: carga.sucursalId };
      const compra = await pedir("POST", "/movimientos-inventario", {
        ...base,
        tipo: "entrada",
        cantidad: p.compra.cantidad,
        costoUnitario: p.compra.costoUnitario,
        fecha: p.compra.fecha,
      });
      expect(compra.status, p.nombre).toBe(201);
      for (const v of p.ventas) {
        const venta = await pedir("POST", "/movimientos-inventario", {
          ...base,
          tipo: "salida",
          cantidad: v.cantidad,
          fecha: v.fecha,
        });
        expect(venta.status, `${p.nombre} ${v.fecha}`).toBe(201);
      }
      const k = await pedir("GET", `/productos/${productoId}/kardex?sucursalId=${carga.sucursalId}`);
      expect(k.status).toBe(200);
      kardexes[metodo].push(k.cuerpo as unknown as KardexVista);
    }
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

const suma = (valores: string[]) => Dinero.sumar(valores).aTexto();
const monto = (valor: string) => Dinero.de(valor).aTexto();

describe.each(METODOS)("kardex de CheroPhonex con %s", (metodo) => {
  const ks = () => kardexes[metodo];

  it("registra los 23 productos con su compra y sus ventas", () => {
    expect(ks()).toHaveLength(caso.inventario.length);
    expect(ks().every((k) => k.metodo === metodo)).toBe(true);
  });

  it("las unidades compradas y vendidas coinciden con el ejercicio", () => {
    const e = esperado.inventario;
    const compradas = ks().reduce((a, k) => a + Number(k.totales.entradaCantidad), 0);
    const vendidas = ks().reduce((a, k) => a + Number(k.totales.salidaCantidad), 0);
    expect(compradas).toBe(e.unidadesCompradas);
    expect(vendidas).toBe(e.unidadesVendidas);
  });

  it("el costo de ventas del kardex es el del estado de resultados: US$ 34,112.00", () => {
    const costo = suma(ks().map((k) => k.totales.salidaTotal));
    expect(costo).toBe(monto(esperado.inventario.costoDeVentas));
    expect(costo).toBe(monto(esperado.estadoDeResultados.costoDeVentas));
  });

  it("las existencias finales del kardex son el inventario del balance: US$ 5,888.00", () => {
    const existencias = suma(ks().map((k) => k.saldoFinal.costoTotal));
    expect(existencias).toBe(monto(esperado.inventario.existenciasFinales));
    const ajustada = esperado.balanzas["ajustada"].cuentas;
    const inventarioContable = suma(
      Object.entries(ajustada)
        .filter(([codigo]) => codigo.startsWith("1109"))
        .map(([, cuenta]) => cuenta.saldoDeudor),
    );
    expect(existencias).toBe(inventarioContable);
  });

  it("cada salida diaria coincide con la partida de costo de ventas de esa fecha", () => {
    const delKardex = new Map<string, string[]>();
    for (const k of ks()) {
      for (const l of k.lineas) {
        if (l.salida) delKardex.set(l.fecha, [...(delKardex.get(l.fecha) ?? []), l.salida.costoTotal]);
      }
    }
    const partidas = caso.partidas.filter((p) => p.concepto.startsWith("Costo de la mercadería vendida"));
    expect(partidas.length).toBe(delKardex.size);
    for (const p of partidas) {
      const debe4104 = suma(p.lineas.filter((l) => l.cuenta.startsWith("4104")).map((l) => l.debe));
      expect([p.fecha, suma(delKardex.get(p.fecha) ?? [])]).toEqual([p.fecha, debe4104]);
    }
  });

  it("el saldo de cada producto cuadra: entradas menos salidas", () => {
    for (const k of ks()) {
      const unidades = Number(k.totales.entradaCantidad) - Number(k.totales.salidaCantidad);
      expect([k.codigo, unidades.toFixed(4)]).toEqual([k.codigo, k.saldoFinal.cantidad]);
      const valor = Dinero.de(k.totales.entradaTotal).menos(k.totales.salidaTotal).aTexto();
      expect([k.codigo, valor]).toEqual([k.codigo, k.saldoFinal.costoTotal]);
    }
  });
});

describe("ambos métodos coinciden en CheroPhonex", () => {
  it("cada producto tiene un solo costo de compra, así que promedio y PEPS dan lo mismo", () => {
    const [prom, peps] = [kardexes["promedio_ponderado"], kardexes["peps"]];
    for (const [i, k] of prom.entries()) {
      expect(k.totales.salidaTotal).toBe(peps[i]!.totales.salidaTotal);
      expect(k.saldoFinal.costoTotal).toBe(peps[i]!.saldoFinal.costoTotal);
    }
  });
});
