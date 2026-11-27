import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarCasoCherophonex } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let empresaId: string;

async function pedir(cuerpo: unknown, conSesion = true) {
  const respuesta = await fetch(`${url}/empresas/${empresaId}/estados/proyecciones`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(conSesion ? { authorization: `Bearer ${CONTADOR}` } : {}),
    },
    body: JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_proyecciones");
  c = await reiniciarBase(urlBase);
  const carga = await cargarCasoCherophonex(c);
  empresaId = carga.empresaId;
  const cuentas = await c.query<{ codigo: string; id: string }>(
    `select codigo, id from cuentas where empresa_id = $1 and codigo = any($2::text[])`,
    [empresaId, ["110101", "110201", "1109", "4104", "420101", "510101"]],
  );
  const cuentaId = new Map(cuentas.rows.map((cuenta) => [cuenta.codigo, cuenta.id]));
  const agregarPartida = async (
    fecha: string,
    concepto: string,
    lineas: readonly { codigo: string; debe: string; haber: string }[],
  ) => {
    const partida = await c.query<{ id: string }>(
      `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto)
       values ($1, $2, $3::date, 'operacion', $4) returning id`,
      [empresaId, carga.sucursalId, fecha, concepto],
    );
    for (const [orden, linea] of lineas.entries()) {
      await c.query(
        `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden)
         values ($1, $2, $3, $4, $5)`,
        [partida.rows[0]!.id, cuentaId.get(linea.codigo), linea.debe, linea.haber, orden],
      );
    }
    await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [partida.rows[0]!.id]);
  };
  for (let mes = 4; mes <= 9; mes++) {
    const fecha = `2026-${String(mes).padStart(2, "0")}-15`;
    await agregarPartida(fecha, `Venta de prueba ${fecha}`, [
      { codigo: "110101", debe: "46051.20", haber: "0.00" },
      { codigo: "510101", debe: "0.00", haber: "46051.20" },
    ]);
    await agregarPartida(fecha, `Costo y gastos de prueba ${fecha}`, [
      { codigo: "4104", debe: "34112.00", haber: "0.00" },
      { codigo: "420101", debe: "4344.21", haber: "0.00" },
      { codigo: "1109", debe: "0.00", haber: "34112.00" },
      { codigo: "110101", debe: "0.00", haber: "4344.21" },
    ]);
  }
  const inversion = await c.query<{ id: string }>(
    `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto)
     values ($1, $2, '2026-10-30', 'operacion', 'Prueba: traslado de efectivo a inversión') returning id`,
    [empresaId, carga.sucursalId],
  );
  await c.query(
    `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden)
     values ($1, $2, 123, 0, 0), ($1, $3, 0, 123, 1)`,
    [inversion.rows[0]!.id, cuentaId.get("110201"), cuentaId.get("110101")],
  );
  await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [inversion.rows[0]!.id]);
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@proyecciones.test')",
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
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("proyección financiera (S4-T25)", () => {
  it("valida sesión y supuestos", async () => {
    expect(
      (await pedir({ meses: 3, crecimientoVentasMensual: 0, crecimientoGastosMensual: 0 }, false)).status,
    ).toBe(401);
    expect(
      (await pedir({ meses: 25, crecimientoVentasMensual: 0, crecimientoGastosMensual: 0 })).status,
    ).toBe(400);
  });

  it("selecciona método según el historial, devuelve intervalos y no crea partidas", async () => {
    const meses = await c.query<{ cantidad: string }>(
      `select count(distinct date_trunc('month', fecha))::text as cantidad
       from partidas where empresa_id = $1 and estado in ('contabilizada', 'anulada') and tipo <> 'cierre'`,
      [empresaId],
    );
    expect(meses.rows[0]?.cantidad).toBe("7");
    const antes = await c.query<{ cantidad: string }>(
      "select count(*)::text as cantidad from partidas where empresa_id = $1",
      [empresaId],
    );
    const respuesta = await pedir({ meses: 3, crecimientoVentasMensual: 5, crecimientoGastosMensual: 2 });
    expect(respuesta.status, JSON.stringify(respuesta.cuerpo)).toBe(201);
    expect(respuesta.cuerpo).toMatchObject({
      calculadaConDatosHasta: "2026-10-01",
      metodo: "regresion",
    });
    const periodos = respuesta.cuerpo["periodos"] as {
      mes: string;
      ventas: { estimado: string; minimo: string; maximo: string };
      gastos: { estimado: string; minimo: string; maximo: string };
      utilidad: { estimado: string; minimo: string; maximo: string };
      flujoEfectivo: { estimado: string; minimo: string; maximo: string };
      iva: { estimado: string; minimo: string; maximo: string };
    }[];
    expect(periodos.map((p) => p.mes)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(periodos).toHaveLength(3);
    expect(periodos[0]).toMatchObject({
      ventas: { estimado: "48353.76" },
      gastos: { estimado: "39225.33" },
      utilidad: { estimado: "9128.43" },
      flujoEfectivo: { estimado: "30530.36" },
    });
    for (const p of periodos) {
      for (const valor of [p.ventas, p.gastos, p.utilidad, p.flujoEfectivo, p.iva]) {
        expect(Number(valor.minimo)).toBeLessThanOrEqual(Number(valor.estimado));
        expect(Number(valor.estimado)).toBeLessThanOrEqual(Number(valor.maximo));
      }
    }
    const despues = await c.query<{ cantidad: string }>(
      "select count(*)::text as cantidad from partidas where empresa_id = $1",
      [empresaId],
    );
    expect(despues.rows[0]?.cantidad).toBe(antes.rows[0]?.cantidad);
  });
});
