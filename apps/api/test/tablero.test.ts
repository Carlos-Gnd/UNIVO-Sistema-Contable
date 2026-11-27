import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarCasoCherophonex, leerCaso } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONTADOR_COMERCIAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUXILIAR_COMERCIAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const caso = leerCaso();
const efectivoEsperado = Object.entries(caso.esperado.balanzas["posterior-cierre"].cuentas)
  .filter(([codigo]) => codigo.startsWith("1101"))
  .reduce(
    (total, [, cuenta]) => total.mas(Dinero.de(cuenta.saldoDeudor).menos(cuenta.saldoAcreedor)),
    Dinero.cero(),
  )
  .menos("123.00")
  .aTexto();

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let empresaId: string;
let empresaComercial: EmpresaComercial;

async function pedir(query: string, usuarioId = CONTADOR, empresa = empresaId) {
  const respuesta = await fetch(`${url}/empresas/${empresa}/tablero${query}`, {
    headers: { authorization: `Bearer ${usuarioId}` },
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

async function post(empresa: string, ruta: string, usuario: string, cuerpo: Record<string, unknown>) {
  const respuesta = await fetch(`${url}/empresas/${empresa}${ruta}`, {
    method: "POST",
    headers: { authorization: `Bearer ${usuario}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_tablero");
  c = await reiniciarBase(urlBase);
  const carga = await cargarCasoCherophonex(c);
  empresaId = carga.empresaId;
  const inversiones = await c.query<{ efectivo: string; inversion: string }>(
    `select
       (select id from cuentas where empresa_id = $1 and codigo = '110101') as efectivo,
       (select id from cuentas where empresa_id = $1 and codigo = '110201') as inversion`,
    [empresaId],
  );
  const partidaInversion = await c.query<{ id: string }>(
    `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto)
     values ($1, $2, '2026-10-30', 'operacion', 'Prueba: traslado de efectivo a inversión') returning id`,
    [empresaId, carga.sucursalId],
  );
  await c.query(
    `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden)
     values ($1, $2, 123, 0, 0), ($1, $3, 0, 123, 1)`,
    [partidaInversion.rows[0]!.id, inversiones.rows[0]!.inversion, inversiones.rows[0]!.efectivo],
  );
  await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [partidaInversion.rows[0]!.id]);
  empresaComercial = await crearEmpresaComercial(c, "0614-010190-210-5");
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@tablero.test')",
    [CONTADOR],
  );
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, empresaId],
  );
  await crearUsuario(c, CONTADOR_COMERCIAL, 2, empresaComercial);
  await crearUsuario(c, AUXILIAR_COMERCIAL, 3, empresaComercial, [empresaComercial.sucursalId]);

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
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("consulta de indicadores del tablero (S4-T19)", () => {
  it("requiere sesión y valida el período mensual", async () => {
    const sinSesion = await fetch(`${url}/empresas/${empresaId}/tablero?mes=2026-10`);
    expect(sinSesion.status).toBe(401);
    expect((await pedir("?mes=2026-13")).status).toBe(400);
    expect((await pedir("?mes=2025-10")).status).toBe(404);
    expect((await pedir("?mes=2026-10&sucursalId=44444444-4444-4444-8444-444444444444")).status).toBe(403);
  });

  it("coincide con las cifras del estado de resultados y limita los datos al período", async () => {
    const respuesta = await pedir("?mes=2026-10");
    expect(respuesta.status, JSON.stringify(respuesta.cuerpo)).toBe(200);
    expect(respuesta.cuerpo).toMatchObject({
      ventasNetas: "46051.20",
      utilidadBruta: "11939.20",
      utilidadEjercicio: "7594.99",
      efectivo: efectivoEsperado,
      margenBruto: "25.93",
      margenNeto: "16.49",
      ventasSemanales: [
        { etiqueta: "1", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "2", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "3", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "4", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "5", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
      ],
    });
  });

  it("calcula ventas por documentos y productos por sucursal, incluyendo notas de crÃ©dito", async () => {
    const { empresaId: comercialId, sucursalId, otraSucursalId, cuenta } = empresaComercial;
    const categoria = await post(comercialId, "/categorias-producto", CONTADOR_COMERCIAL, {
      nombre: "TecnologÃ­a tablero",
    });
    expect(categoria.status, JSON.stringify(categoria.cuerpo)).toBe(201);
    const producto = await post(comercialId, "/productos", CONTADOR_COMERCIAL, {
      codigo: "TAB-001",
      nombre: "Equipo de prueba del tablero",
      categoriaId: categoria.cuerpo["id"],
    });
    expect(producto.status, JSON.stringify(producto.cuerpo)).toBe(201);
    const cliente = await post(comercialId, "/terceros", CONTADOR_COMERCIAL, {
      nombre: "Cliente de prueba del tablero",
      nit: "1234-567890-123-0",
      nrc: "245871-4",
      esCliente: true,
    });
    const proveedor = await post(comercialId, "/terceros", CONTADOR_COMERCIAL, {
      nombre: "Proveedor de prueba del tablero",
      nit: "0000-000000-104-0",
      nrc: "123456-7",
      esProveedor: true,
    });
    expect(cliente.status, JSON.stringify(cliente.cuerpo)).toBe(201);
    expect(proveedor.status, JSON.stringify(proveedor.cuerpo)).toBe(201);

    for (const [sucursal, cantidad, numero] of [
      [sucursalId, 20, "TAB-COMPRA-1"],
      [otraSucursalId, 10, "TAB-COMPRA-2"],
    ] as const) {
      const compra = await post(comercialId, "/compras", CONTADOR_COMERCIAL, {
        sucursalId: sucursal,
        tipoDocumento: "ccf",
        numeroDocumento: numero,
        fecha: "2026-10-01",
        terceroId: proveedor.cuerpo["id"],
        condicionPago: "credito",
        lineas: [{ productoId: producto.cuerpo["id"], cantidad, precioUnitario: 100 }],
      });
      expect(compra.status, JSON.stringify(compra.cuerpo)).toBe(201);
    }

    const ventaCcf = await post(comercialId, "/ventas", CONTADOR_COMERCIAL, {
      sucursalId,
      tipoDocumento: "ccf",
      numeroDocumento: "TAB-CCF-1",
      fecha: "2026-10-05",
      terceroId: cliente.cuerpo["id"],
      condicionPago: "credito",
      lineas: [{ productoId: producto.cuerpo["id"], cantidad: 2, precioUnitario: 200 }],
    });
    expect(ventaCcf.status, JSON.stringify(ventaCcf.cuerpo)).toBe(201);
    const factura = await post(comercialId, "/ventas", CONTADOR_COMERCIAL, {
      sucursalId,
      tipoDocumento: "factura",
      numeroDocumento: "TAB-FACTURA-1",
      fecha: "2026-10-12",
      condicionPago: "contado",
      cuentaPagoId: await cuenta("110101"),
      lineas: [{ productoId: producto.cuerpo["id"], cantidad: 1, precioUnitario: 904 }],
    });
    expect(factura.status, JSON.stringify(factura.cuerpo)).toBe(201);
    const nota = await post(comercialId, "/notas-comerciales", CONTADOR_COMERCIAL, {
      documentoId: ventaCcf.cuerpo["id"],
      tipo: "credito",
      motivo: "devolucion",
      numeroNota: "TAB-NC-1",
      fecha: "2026-10-19",
      lineas: [{ lineaOrden: 1, cantidad: 1 }],
    });
    expect(nota.status, JSON.stringify(nota.cuerpo)).toBe(201);
    const ventaOtraSucursal = await post(comercialId, "/ventas", CONTADOR_COMERCIAL, {
      sucursalId: otraSucursalId,
      tipoDocumento: "ccf",
      numeroDocumento: "TAB-CCF-2",
      fecha: "2026-10-20",
      terceroId: cliente.cuerpo["id"],
      condicionPago: "contado",
      cuentaPagoId: await cuenta("110101"),
      lineas: [{ productoId: producto.cuerpo["id"], cantidad: 1, precioUnitario: 300 }],
    });
    expect(ventaOtraSucursal.status, JSON.stringify(ventaOtraSucursal.cuerpo)).toBe(201);
    await c.query(
      `update partidas set estado = 'contabilizada'
       where empresa_id = $1 and fecha between '2026-10-01' and '2026-10-31' and estado = 'borrador'`,
      [comercialId],
    );

    const matriz = await pedir(`?mes=2026-10&sucursalId=${sucursalId}`, AUXILIAR_COMERCIAL, comercialId);
    expect(matriz.status, JSON.stringify(matriz.cuerpo)).toBe(200);
    expect(matriz.cuerpo["ventasNetas"]).toBe("1000.00");
    expect((matriz.cuerpo["ventasSemanales"] as unknown[]).slice(0, 3)).toMatchObject([
      { etiqueta: "1", comprobantesCreditoFiscal: "400.00", consumidorFinal: "0.00" },
      { etiqueta: "2", comprobantesCreditoFiscal: "0.00", consumidorFinal: "800.00" },
      { etiqueta: "3", comprobantesCreditoFiscal: "-200.00", consumidorFinal: "0.00" },
    ]);
    expect(matriz.cuerpo["productosRentables"]).toMatchObject([
      { id: producto.cuerpo["id"], utilidadBruta: "800.00" },
    ]);
    expect(matriz.cuerpo["categorias"]).toMatchObject([
      { id: categoria.cuerpo["id"], ventasNetas: "1000.00", utilidadBruta: "800.00" },
    ]);
    expect(
      (await pedir(`?mes=2026-10&sucursalId=${otraSucursalId}`, AUXILIAR_COMERCIAL, comercialId)).status,
    ).toBe(403);

    const consolidado = await pedir("?mes=2026-10", CONTADOR_COMERCIAL, comercialId);
    expect(consolidado.status, JSON.stringify(consolidado.cuerpo)).toBe(200);
    expect(consolidado.cuerpo["ventasNetas"]).toBe("1300.00");
    expect(consolidado.cuerpo["productosRentables"]).toMatchObject([
      { id: producto.cuerpo["id"], utilidadBruta: "1000.00" },
    ]);
  });
});
