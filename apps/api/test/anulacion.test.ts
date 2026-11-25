// Anulación por reversión (HU-24, S2-T14): el caso de uso AnularPartida contra PostgreSQL.
// Usa una base propia en el mismo servidor de pruebas que packages/db.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
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
import { AnularPartida } from "../src/modules/contabilidad/application/anular-partida.js";
import { PartidaNoAnulableError } from "../src/modules/contabilidad/domain/anulacion.js";
import { ReglaContableError } from "../src/modules/contabilidad/domain/contabilizacion.js";
import { SinPermisoPartidasError } from "../src/modules/contabilidad/domain/partida-borrador.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let anularPartida: AnularPartida;
let esc: Escenario;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_anulacion");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");

  const usuarios: [string, number, boolean][] = [
    [CONTADOR, 2, true],
    [AUXILIAR, 3, false],
  ];
  for (const [id, rol, todas] of usuarios) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      `Usuario ${rol}`,
      `${id}@prueba.sv`,
    ]);
    await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
      [id, esc.empresaId, rol, todas],
    );
  }

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({ verificarToken: async () => null })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.init();
  anularPartida = app.get(AnularPartida);
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

const caja = () => esc.cuentas["110101"]!;
const ventas = () => esc.cuentas["5101"]!;

/** Venta con tres líneas con centavos, contabilizada; devuelve su id. */
async function ventaContabilizada(fecha = "2026-11-10"): Promise<string> {
  const id = await crearPartida(c, esc, fecha, [
    [caja(), "113.07", "0"],
    [ventas(), "0", "100.06"],
    [esc.cuentas["110101"]!, "0", "13.01"],
  ]);
  await contabilizar(c, id);
  return id;
}

const partida = async (id: string) =>
  (
    await c.query(
      `select estado, tipo, numero, fecha::text as fecha, concepto, partida_revertida_id, motivo_anulacion,
              anulado_por, anulado_en is not null as anulada_con_fecha, origen
       from partidas where id = $1`,
      [id],
    )
  ).rows[0];

const lineas = async (id: string) =>
  (
    await c.query(
      `select cuenta_id, debe::text, haber::text from partida_detalles where partida_id = $1 order by orden`,
      [id],
    )
  ).rows as { cuenta_id: string; debe: string; haber: string }[];

const ultimoNumero = async () =>
  (await c.query("select max(numero) as n from partidas where empresa_id = $1", [esc.empresaId])).rows[0]
    .n as number;

describe("AnularPartida contra la base de datos", () => {
  it("registra una reversión contabilizada que invierte debe y haber y cuadra", async () => {
    const id = await ventaContabilizada();
    const r = await anularPartida.ejecutar(CONTADOR, esc.empresaId, id, {
      motivo: "Cobro duplicado",
      fecha: "2026-11-12",
    });

    const original = await lineas(id);
    const reversion = await lineas(r.reversion.id);
    expect(reversion).toHaveLength(original.length);
    original.forEach((linea, i) => {
      expect(reversion[i]).toEqual({ cuenta_id: linea.cuenta_id, debe: linea.haber, haber: linea.debe });
    });

    const cabecera = await partida(r.reversion.id);
    expect(cabecera).toMatchObject({
      estado: "contabilizada",
      tipo: "reversion",
      fecha: "2026-11-12",
      partida_revertida_id: id,
      origen: "anulacion",
    });
    expect(cabecera.numero).toBe(r.reversion.numero);
    expect(cabecera.concepto).toContain("Cobro duplicado");

    const totales = (
      await c.query(
        `select sum(debe)::text as debe, sum(haber)::text as haber from partida_detalles where partida_id = $1`,
        [r.reversion.id],
      )
    ).rows[0];
    expect(totales).toEqual({ debe: "113.07", haber: "113.07" });
  });

  it("deja la original anulada, con el motivo, quién la anuló y cuándo, sin tocar sus líneas", async () => {
    const id = await ventaContabilizada();
    const antes = await lineas(id);
    await anularPartida.ejecutar(CONTADOR, esc.empresaId, id, {
      motivo: "Monto equivocado",
      fecha: "2026-11-12",
    });

    expect(await partida(id)).toMatchObject({
      estado: "anulada",
      motivo_anulacion: "Monto equivocado",
      anulado_por: CONTADOR,
      anulada_con_fecha: true,
    });
    expect(await lineas(id)).toEqual(antes);
  });

  it("la original y su reversión juntas dejan cada cuenta en cero", async () => {
    const id = await ventaContabilizada();
    const r = await anularPartida.ejecutar(CONTADOR, esc.empresaId, id, {
      motivo: "Prueba",
      fecha: "2026-11-12",
    });
    const saldos = await c.query(
      `select cuenta_id, sum(debe - haber)::text as saldo from partida_detalles
       where partida_id = any($1::uuid[]) group by cuenta_id`,
      [[id, r.reversion.id]],
    );
    expect(saldos.rows.map((s) => s.saldo)).toEqual(saldos.rows.map(() => "0.00"));
  });

  it("la reversión recibe el siguiente correlativo y queda en la bitácora a nombre de quien anuló", async () => {
    const id = await ventaContabilizada();
    const ultimo = await ultimoNumero();
    const r = await anularPartida.ejecutar(CONTADOR, esc.empresaId, id, {
      motivo: "Bitácora",
      fecha: "2026-11-12",
    });
    expect(r.reversion.numero).toBe(ultimo + 1);

    const bitacora = await c.query(
      `select registro_id::text as id, accion, usuario_id::text as usuario,
              datos_anteriores ->> 'estado' as antes, datos_nuevos ->> 'estado' as despues
       from bitacora where tabla = 'partidas' and registro_id = any($1::text[]) order by bitacora.id`,
      [[id, r.reversion.id]],
    );
    const deLaOriginal = bitacora.rows.filter((f) => f.id === id && f.accion === "UPDATE");
    expect(deLaOriginal.at(-1)).toMatchObject({
      usuario: CONTADOR,
      antes: "contabilizada",
      despues: "anulada",
    });
    const deLaReversion = bitacora.rows.filter((f) => f.id === r.reversion.id);
    expect(deLaReversion.map((f) => f.accion)).toContain("INSERT");
    expect(deLaReversion.every((f) => f.usuario === CONTADOR)).toBe(true);
    expect(deLaReversion.at(-1)).toMatchObject({ despues: "contabilizada" });
  });

  it("anula una partida de un período cerrado si la reversión va en un período abierto", async () => {
    const id = await ventaContabilizada("2026-08-10");
    await c.query(`update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 8`, [
      esc.empresaId,
    ]);
    const r = await anularPartida.ejecutar(CONTADOR, esc.empresaId, id, {
      motivo: "Error de agosto",
      fecha: "2026-11-12",
    });
    expect((await partida(id)).estado).toBe("anulada");
    expect((await partida(r.reversion.id)).fecha).toBe("2026-11-12");
  });

  it("si el período de la reversión está cerrado, no anula la original ni consume correlativo", async () => {
    const id = await ventaContabilizada("2026-11-10");
    await c.query(`update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 12`, [
      esc.empresaId,
    ]);
    const ultimo = await ultimoNumero();

    await expect(
      anularPartida.ejecutar(CONTADOR, esc.empresaId, id, {
        motivo: "Diciembre cerrado",
        fecha: "2026-12-05",
      }),
    ).rejects.toThrow(ReglaContableError);

    expect((await partida(id)).estado).toBe("contabilizada");
    expect(
      Number(
        (await c.query(`select count(*) from partidas where partida_revertida_id = $1`, [id])).rows[0].count,
      ),
    ).toBe(0);
    expect(await ultimoNumero()).toBe(ultimo);
  });

  it("solo una de dos anulaciones simultáneas de la misma partida se completa", async () => {
    const id = await ventaContabilizada();
    const intentos = await Promise.allSettled([
      anularPartida.ejecutar(CONTADOR, esc.empresaId, id, { motivo: "Una", fecha: "2026-11-12" }),
      anularPartida.ejecutar(CONTADOR, esc.empresaId, id, { motivo: "Otra", fecha: "2026-11-12" }),
    ]);
    expect(intentos.filter((i) => i.status === "fulfilled")).toHaveLength(1);
    const rechazada = intentos.find((i) => i.status === "rejected") as PromiseRejectedResult;
    expect(rechazada.reason).toBeInstanceOf(PartidaNoAnulableError);
    expect(
      Number(
        (await c.query(`select count(*) from partidas where partida_revertida_id = $1`, [id])).rows[0].count,
      ),
    ).toBe(1);
  });

  it("no anula una reversión, un borrador ni una partida ya anulada", async () => {
    const id = await ventaContabilizada();
    const r = await anularPartida.ejecutar(CONTADOR, esc.empresaId, id, {
      motivo: "Primera",
      fecha: "2026-11-12",
    });
    await expect(
      anularPartida.ejecutar(CONTADOR, esc.empresaId, id, { motivo: "Segunda", fecha: "2026-11-12" }),
    ).rejects.toThrow(/ya está anulada/);
    await expect(
      anularPartida.ejecutar(CONTADOR, esc.empresaId, r.reversion.id, {
        motivo: "Revertir la reversión",
        fecha: "2026-11-12",
      }),
    ).rejects.toThrow(/reversión no se anula/);

    const borrador = await crearPartida(c, esc, "2026-11-10", [[caja(), "10", "0"]]);
    await expect(
      anularPartida.ejecutar(CONTADOR, esc.empresaId, borrador, { motivo: "Borrador", fecha: "2026-11-12" }),
    ).rejects.toThrow(/borrador no se anula/);
  });

  it("el auxiliar no puede anular y la partida queda intacta", async () => {
    const id = await ventaContabilizada();
    await expect(
      anularPartida.ejecutar(AUXILIAR, esc.empresaId, id, { motivo: "Sin permiso", fecha: "2026-11-12" }),
    ).rejects.toThrow(SinPermisoPartidasError);
    expect((await partida(id)).estado).toBe("contabilizada");
  });
});
