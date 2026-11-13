import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NIT_DEMO, sembrar, urlSemilla, USUARIOS_DEMO } from "../prisma/seed";
import { reiniciarBase } from "./helpers";

let c: pg.Client;
let empresaId: string;

beforeAll(async () => {
  c = await reiniciarBase();
  const r = await sembrar(c);
  expect(r.creada).toBe(true);
  empresaId = r.empresaId;
});
afterAll(async () => {
  await c?.end();
});

describe("semilla de datos de prueba (S1-T25)", () => {
  it("crea la empresa con dos sucursales, el catálogo de sociedad y el ejercicio 2026", async () => {
    const r = await c.query(
      `select (select count(*) from sucursales where empresa_id = $1)::int as sucursales,
              (select count(*) from cuentas where empresa_id = $1)::int as cuentas,
              (select count(*) from periodos where empresa_id = $1)::int as periodos`,
      [empresaId],
    );
    expect(r.rows[0]).toEqual({ sucursales: 2, cuentas: 165, periodos: 12 });
  });

  it("crea un usuario por rol; el auxiliar solo tiene asignada la casa matriz", async () => {
    const r = await c.query(
      `select r.codigo, m.todas_sucursales, (select count(*) from membresia_sucursales ms where ms.membresia_id = m.id)::int as asignadas
       from membresias m join roles r on r.id = m.rol_id where m.empresa_id = $1 order by r.id`,
      [empresaId],
    );
    expect(r.rows).toEqual([
      { codigo: "administrador", todas_sucursales: true, asignadas: 0 },
      { codigo: "contador", todas_sucursales: true, asignadas: 0 },
      { codigo: "auxiliar", todas_sucursales: false, asignadas: 1 },
      { codigo: "consulta", todas_sucursales: true, asignadas: 0 },
    ]);
  });

  it("deja partidas en los tres estados, numeradas sin saltos en orden de fecha", async () => {
    const r = await c.query(
      `select estado, count(*)::int as n, array_agg(numero order by numero) filter (where numero is not null) as numeros
       from partidas where empresa_id = $1 group by estado order by estado`,
      [empresaId],
    );
    expect(r.rows).toEqual([
      { estado: "borrador", n: 2, numeros: null },
      { estado: "contabilizada", n: 7, numeros: [1, 2, 3, 4, 5, 6, 8] },
      { estado: "anulada", n: 1, numeros: [7] },
    ]);
  });

  it("la balanza de comprobación cuadra y la anulada se compensa con su reversión", async () => {
    const r = await c.query(
      `select sum(d.debe)::text as debe, sum(d.haber)::text as haber
       from partida_detalles d join partidas p on p.id = d.partida_id
       where p.empresa_id = $1 and p.estado in ('contabilizada', 'anulada')`,
      [empresaId],
    );
    expect(r.rows[0].debe).toBe(r.rows[0].haber);
    const caja = await c.query(
      `select sum(d.debe - d.haber)::text as saldo from partida_detalles d
       join partidas p on p.id = d.partida_id join cuentas k on k.id = d.cuenta_id
       where p.empresa_id = $1 and p.estado in ('contabilizada', 'anulada') and k.codigo = '110101'`,
      [empresaId],
    );
    // 5,000 de apertura + 1,130 de la venta al contado; la venta duplicada se anuló
    expect(caja.rows[0].saldo).toBe("6130.00");
    const rev = await c.query(
      `select a.motivo_anulacion, r.tipo from partidas a join partidas r on r.partida_revertida_id = a.id
       where a.empresa_id = $1 and a.estado = 'anulada'`,
      [empresaId],
    );
    expect(rev.rows[0]).toMatchObject({ tipo: "reversion" });
    expect(rev.rows[0].motivo_anulacion).toBeTruthy();
  });

  it("registra en la bitácora quién creó cada partida", async () => {
    const r = await c.query(
      `select distinct u.correo from partidas p join usuarios u on u.id = p.creado_por where p.empresa_id = $1
       order by 1`,
      [empresaId],
    );
    expect(r.rows.map((x) => x.correo)).toEqual(["auxiliar@ejemplo.com", "contador@ejemplo.com"]);
    const b = await c.query(
      `select count(*)::int as n from bitacora where empresa_id = $1 and usuario_id is null`,
      [empresaId],
    );
    expect(b.rows[0].n).toBe(0);
  });

  it("es idempotente: una segunda ejecución no duplica nada", async () => {
    const r = await sembrar(c);
    expect(r).toEqual({ creada: false, empresaId });
    const n = await c.query(`select count(*)::int as n from empresas where nit = $1`, [NIT_DEMO]);
    expect(n.rows[0].n).toBe(1);
    expect((await c.query(`select count(*)::int as n from usuarios`)).rows[0].n).toBe(USUARIOS_DEMO.length);
  });

  it("nunca usa DATABASE_URL ni corre contra una base remota sin permiso explícito", () => {
    const supabase = "postgresql://u:p@aws-1-us-east-1.pooler.supabase.com:5432/postgres";
    expect(urlSemilla({ DATABASE_URL: supabase })).toContain("localhost:54329");
    expect(() => urlSemilla({ SEED_DATABASE_URL: supabase })).toThrow(/local/);
    expect(urlSemilla({ SEED_DATABASE_URL: supabase, SEED_PERMITIR_REMOTO: "1" })).toBe(supabase);
  });
});
