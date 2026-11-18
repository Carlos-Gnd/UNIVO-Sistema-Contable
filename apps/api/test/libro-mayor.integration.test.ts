import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { LibroMayor } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  basePropia,
  contabilizar,
  crearEscenario,
  crearPartida,
  reiniciarBase,
  type Escenario,
} from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const AJENO = "44444444-4444-4444-8444-444444444444";
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let nit = 700;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_libro_mayor");
  c = await reiniciarBase(urlBase);
  for (const [id, nombre] of [
    [CONTADOR, "Contador"],
    [AUXILIAR, "Auxiliar"],
    [AJENO, "Ajeno"],
  ]) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${id}@prueba.sv`,
    ]);
  }
  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue(authPrueba)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

async function empresaNueva() {
  const empresa = await crearEscenario(c, `0614-010190-${String(nit++).padStart(3, "0")}-0`);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, empresa.empresaId],
  );
  const hija = await c.query(
    "insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, '110102', 'Caja secundaria', 'deudora', 'activo') returning id",
    [empresa.empresaId],
  );
  const ventas = empresa.cuentas["5101"]!;
  const caja = empresa.cuentas["110101"]!;
  return { ...empresa, hija: hija.rows[0]!.id as string, ventas, caja };
}

async function registrarVenta(
  e: Escenario & { caja: string; ventas: string },
  fecha: string,
  cuentaCaja: string,
  monto: string,
  sucursalId = e.sucursalId,
) {
  const id = await crearPartida(
    c,
    { ...e, sucursalId },
    fecha,
    [
      [cuentaCaja, monto, "0"],
      [e.ventas, "0", monto],
    ],
    "operacion",
  );
  await contabilizar(c, id);
  return id;
}

async function consultar(
  e: Escenario,
  cuentaId: string,
  usuario = CONTADOR,
  filtros: Record<string, string> = {},
) {
  const qs = new URLSearchParams(filtros);
  const r = await fetch(`${url}/empresas/${e.empresaId}/cuentas/${cuentaId}/libro-mayor?${qs}`, {
    headers: { authorization: `Bearer ${usuario}` },
  });
  return { status: r.status, cuerpo: (await r.json()) as LibroMayor };
}

describe("GET libro mayor con PostgreSQL", () => {
  it("agrega movimientos descendientes y muestra el código de subcuenta por línea", async () => {
    const e = await empresaNueva();
    await registrarVenta(e, "2026-11-01", e.caja, "100.00");
    await registrarVenta(e, "2026-11-02", e.hija, "25.00");

    const mayor = await consultar(e, e.cuentas["1101"]!);
    expect(mayor.status).toBe(200);
    expect(mayor.cuerpo.movimientos).toHaveLength(2);
    expect(mayor.cuerpo.movimientos.map((m) => m.cuentaCodigo)).toEqual(["110101", "110102"]);
    expect(mayor.cuerpo.saldoFinal).toBe("125.00");

    const hoja = await consultar(e, e.caja);
    expect(hoja.status).toBe(200);
    expect(hoja.cuerpo.movimientos).toHaveLength(1);
    expect(hoja.cuerpo.movimientos[0]?.cuentaCodigo).toBe("110101");
  });

  it("expone saldo natural acreedor positivo, saldo inicial, filtros y anulada con reversión", async () => {
    const e = await empresaNueva();
    await registrarVenta(e, "2026-10-31", e.caja, "100.00");
    const original = await registrarVenta(e, "2026-11-05", e.caja, "40.00");
    const reversion = await crearPartida(
      c,
      e,
      "2026-11-06",
      [
        [e.caja, "0", "40"],
        [e.ventas, "40", "0"],
      ],
      "reversion",
    );
    await c.query("update partidas set partida_revertida_id = $2 where id = $1", [reversion, original]);
    await contabilizar(c, reversion);
    await c.query("update partidas set estado = 'anulada', motivo_anulacion = 'Duplicada' where id = $1", [
      original,
    ]);

    const mayor = await consultar(e, e.ventas, CONTADOR, {
      desde: "2026-11-01",
      hasta: "2026-11-30",
      tipo: "reversion",
    });
    expect(mayor.status).toBe(200);
    expect(mayor.cuerpo.naturaleza).toBe("acreedora");
    expect(mayor.cuerpo.saldoInicial).toBe("100.00");
    expect(mayor.cuerpo.movimientos).toHaveLength(1);
    expect(mayor.cuerpo.movimientos[0]?.saldo).toBe("100.00");
    expect(mayor.cuerpo.saldoFinal).toBe("100.00");
  });

  it("limita por sucursal y oculta cuentas de otra empresa", async () => {
    const e = await empresaNueva();
    const otraSucursal = (
      await c.query(
        "insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Norte', 'S002') returning id",
        [e.empresaId],
      )
    ).rows[0]!.id as string;
    await registrarVenta(e, "2026-11-10", e.caja, "100.00", e.sucursalId);
    await registrarVenta(e, "2026-11-11", e.caja, "40.00", otraSucursal);
    const membresia = await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 3, false) returning id",
      [AUXILIAR, e.empresaId],
    );
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
      membresia.rows[0]!.id,
      e.sucursalId,
    ]);
    const otraEmpresa = await crearEscenario(c, `0614-010190-${String(nit++).padStart(3, "0")}-0`);

    const mayor = await consultar(e, e.caja, AUXILIAR);
    expect(mayor.status).toBe(200);
    expect(mayor.cuerpo.movimientos).toHaveLength(1);
    expect(
      (await consultar(e, e.caja, AUXILIAR, { sucursalId: e.sucursalId })).cuerpo.movimientos,
    ).toHaveLength(1);
    expect((await consultar(e, e.caja, AUXILIAR, { sucursalId: otraSucursal })).status).toBe(403);
    expect((await consultar(e, otraEmpresa.cuentas["110101"]!)).status).toBe(404);
  });
});
