// HU-68: el conteo ajusta existencias y deja el asiento contable como borrador.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const SIN_MEMBRESIA = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let sucursalSecundaria: string;
let inventarioId: string;
let n = 0;

async function pedir(metodo: string, ruta: string, usuario: string | null, cuerpo?: unknown) {
  const respuesta = await fetch(`${url}/empresas/${esc.empresaId}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

async function crearUsuario(id: string, rol: number, sucursal: string | null) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${id.slice(0, 4)}`,
    `u${id.slice(0, 4)}@toma.test`,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
    [id, esc.empresaId, rol, sucursal === null],
  );
  if (sucursal) {
    await c.query(
      "insert into membresia_sucursales (membresia_id, sucursal_id) select id, $2 from membresias where usuario_id = $1 and empresa_id = $3",
      [id, sucursal, esc.empresaId],
    );
  }
}

async function nuevoProducto(controlaSeries = false): Promise<string> {
  const r = await pedir("POST", "/productos", CONTADOR, {
    codigo: `TOMA-${++n}`,
    nombre: `Producto ${n}`,
    controlaSeries,
  });
  expect(r.status).toBe(201);
  return r.cuerpo["id"] as string;
}

async function mover(
  productoId: string,
  tipo: "entrada" | "salida",
  cantidad: string,
  costoUnitario?: string,
  series?: string[],
  fecha = "2026-02-01",
) {
  return pedir("POST", "/movimientos-inventario", CONTADOR, {
    productoId,
    sucursalId: esc.sucursalId,
    tipo,
    cantidad,
    fecha,
    ...(costoUnitario ? { costoUnitario } : {}),
    ...(series ? { series } : {}),
  });
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_toma_fisica");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-680101-101-1");
  const cuenta = await c.query(
    "insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo, cuenta_padre_id) values ($1, '1109', 'Inventarios', 'deudora', 'activo', $2) returning id",
    [esc.empresaId, esc.cuentas["11"]],
  );
  inventarioId = cuenta.rows[0].id as string;
  sucursalSecundaria = (
    await c.query(
      "insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Usulután', 'S002') returning id",
      [esc.empresaId],
    )
  ).rows[0].id as string;
  await crearUsuario(CONTADOR, 2, null);
  await crearUsuario(AUXILIAR, 3, esc.sucursalId);
  await crearUsuario(CONSULTA, 4, esc.sucursalId);

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

describe("toma física (HU-68)", () => {
  it("captura diferencias y aprueba una partida balanceada dejando el kardex igual al conteo", async () => {
    const faltante = await nuevoProducto();
    const sobrante = await nuevoProducto();
    expect((await mover(faltante, "entrada", "10", "10")).status).toBe(201);
    expect((await mover(sobrante, "entrada", "2", "5")).status).toBe(201);

    const iniciada = await pedir("POST", "/tomas-fisicas", AUXILIAR, {
      sucursalId: esc.sucursalId,
      fecha: "2026-02-10",
    });
    expect(iniciada.status).toBe(201);
    const toma = iniciada.cuerpo;
    expect(toma["estado"]).toBe("en_conteo");
    expect(toma["detalles"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productoId: faltante,
          existenciaSistema: "10.0000",
          cantidadContada: null,
        }),
        expect.objectContaining({ productoId: sobrante, existenciaSistema: "2.0000", cantidadContada: null }),
      ]),
    );

    const guardada = await pedir("PATCH", `/tomas-fisicas/${toma["id"]}/conteo`, AUXILIAR, {
      lineas: [
        { productoId: faltante, cantidadContada: "8" },
        { productoId: sobrante, cantidadContada: "4" },
      ],
    });
    expect(guardada.status).toBe(200);
    expect(guardada.cuerpo["resumen"]).toMatchObject({
      productosConDiferencia: 2,
      cantidadFaltante: "2.0000",
      cantidadSobrante: "2.0000",
      valorFaltante: "20.00",
      valorSobrante: null,
    });

    expect((await pedir("POST", `/tomas-fisicas/${toma["id"]}/aprobar`, AUXILIAR, {})).status).toBe(403);
    const costoPendiente = await pedir("POST", `/tomas-fisicas/${toma["id"]}/aprobar`, CONTADOR, {
      cuentaFaltantesId: esc.cuentas["5101"],
      cuentaSobrantesId: esc.cuentas["110101"],
    });
    expect(costoPendiente.status).toBe(422);

    const aprobada = await pedir("POST", `/tomas-fisicas/${toma["id"]}/aprobar`, CONTADOR, {
      cuentaFaltantesId: esc.cuentas["5101"],
      cuentaSobrantesId: esc.cuentas["110101"],
      costosSobrantes: [{ productoId: sobrante, costoUnitario: "6" }],
    });
    expect(aprobada.status).toBe(201);
    expect(aprobada.cuerpo["estado"]).toBe("aprobada");
    expect(aprobada.cuerpo["partidaId"]).toEqual(expect.any(String));
    expect(aprobada.cuerpo["resumen"]).toMatchObject({
      valorFaltante: "20.00",
      valorSobrante: "12.00",
    });
    expect(aprobada.cuerpo["detalles"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productoId: faltante, cantidadContada: "8.0000", valorFinal: "80.00" }),
        expect.objectContaining({ productoId: sobrante, cantidadContada: "4.0000", valorFinal: "22.00" }),
      ]),
    );

    const asiento = await c.query(
      "select p.estado::text, p.tipo::text, p.origen, p.origen_id::text, sum(d.debe)::text as debe, sum(d.haber)::text as haber from partidas p join partida_detalles d on d.partida_id = p.id where p.id = $1 group by p.id",
      [aprobada.cuerpo["partidaId"]],
    );
    expect(asiento.rows[0]).toMatchObject({
      estado: "borrador",
      tipo: "ajuste",
      origen: "toma_fisica",
      origen_id: toma["id"],
      debe: "32.00",
      haber: "32.00",
    });
    expect(inventarioId).toEqual(expect.any(String));

    for (const [productoId, cantidad, valor] of [
      [faltante, "8.0000", "80.00"],
      [sobrante, "4.0000", "22.00"],
    ]) {
      const kardex = await pedir(
        "GET",
        `/productos/${productoId}/kardex?sucursalId=${esc.sucursalId}`,
        CONTADOR,
      );
      expect(kardex.status).toBe(200);
      expect(kardex.cuerpo).toMatchObject({ saldoFinal: { cantidad, costoTotal: valor } });
    }
  });

  it("registra sobrantes seriados con costo propio y sus IMEI quedan en existencia", async () => {
    await c.query("update productos set activo = false where empresa_id = $1", [esc.empresaId]);
    const producto = await nuevoProducto(true);
    expect((await mover(producto, "entrada", "1", "10", ["IMEI-UNO"])).status).toBe(201);
    const iniciada = await pedir("POST", "/tomas-fisicas", AUXILIAR, {
      sucursalId: esc.sucursalId,
      fecha: "2026-02-10",
    });
    expect(iniciada.status).toBe(201);
    const tomaId = iniciada.cuerpo["id"] as string;
    const guardada = await pedir("PATCH", `/tomas-fisicas/${tomaId}/conteo`, AUXILIAR, {
      lineas: [{ productoId: producto, cantidadContada: "2", seriesContadas: ["imei-uno", "imei-dos"] }],
    });
    expect(guardada.status).toBe(200);
    expect(guardada.cuerpo["detalles"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ productoId: producto, cantidadSobrante: "1.0000" })]),
    );
    const aprobada = await pedir("POST", `/tomas-fisicas/${tomaId}/aprobar`, CONTADOR, {
      cuentaSobrantesId: esc.cuentas["110101"],
      costosSobrantes: [{ productoId: producto, costoUnitario: "12" }],
    });
    expect(aprobada.status).toBe(201);
    expect(aprobada.cuerpo["resumen"]).toMatchObject({ valorSobrante: "12.00" });
    expect(
      await c.query(
        "select numero_serie, costo_unitario::text, movimiento_salida_id from series_inventario where producto_id = $1 order by numero_serie",
        [producto],
      ),
    ).toMatchObject({
      rows: [
        { numero_serie: "IMEI-DOS", costo_unitario: "12.00", movimiento_salida_id: null },
        { numero_serie: "IMEI-UNO", costo_unitario: "10.00", movimiento_salida_id: null },
      ],
    });
  });

  it("requiere el conteo completo, rechaza movimientos posteriores y respeta empresa y sucursal", async () => {
    await c.query("update productos set activo = false where empresa_id = $1", [esc.empresaId]);
    const producto = await nuevoProducto();
    const iniciada = await pedir("POST", "/tomas-fisicas", AUXILIAR, {
      sucursalId: esc.sucursalId,
      fecha: "2026-02-10",
    });
    expect(iniciada.status).toBe(201);
    const tomaId = iniciada.cuerpo["id"] as string;
    expect((await pedir("POST", `/tomas-fisicas/${tomaId}/aprobar`, CONTADOR, {})).status).toBe(422);
    expect((await mover(producto, "entrada", "1", "3", undefined, "2026-02-11")).status).toBe(201);
    const capturada = await pedir("PATCH", `/tomas-fisicas/${tomaId}/conteo`, AUXILIAR, {
      lineas: [{ productoId: producto, cantidadContada: "0" }],
    });
    expect(capturada.status).toBe(200);
    const aprobada = await pedir("POST", `/tomas-fisicas/${tomaId}/aprobar`, CONTADOR, {});
    expect(aprobada.status).toBe(422);
    expect(aprobada.cuerpo["message"]).toContain("cambió después de iniciar el conteo");

    const ruta = `/tomas-fisicas?sucursalId=${sucursalSecundaria}`;
    expect((await pedir("GET", ruta, AUXILIAR)).status).toBe(403);
    expect(
      (await pedir("POST", "/tomas-fisicas", CONSULTA, { sucursalId: esc.sucursalId, fecha: "2026-02-10" }))
        .status,
    ).toBe(403);
    expect((await pedir("GET", `/tomas-fisicas?sucursalId=${esc.sucursalId}`, SIN_MEMBRESIA)).status).toBe(
      404,
    );
  });
});
