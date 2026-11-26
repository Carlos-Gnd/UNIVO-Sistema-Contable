// Reglas de la tabla depreciaciones (migración 20261204000200_depreciacion, HU-82, S3-T130).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contabilizar, crearEscenario, crearPartida, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let activoId: string;
let partidaId: string;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  for (const [codigo, nombre, naturaleza, tipo] of [
    ["12", "Activo no corriente", "deudora", "activo"],
    ["1201", "Propiedad, planta y equipo", "deudora", "activo"],
    ["120105", "Mobiliario y Equipo", "deudora", "activo"],
    ["1202", "(R) Depreciaciones", "acreedora", "activo"],
    ["120204", "Depreciación mobiliario", "acreedora", "activo"],
    ["4", "Costos y gastos", "deudora", "costos_gastos"],
    ["42", "Gastos", "deudora", "costos_gastos"],
    ["4201", "Gastos de administración", "deudora", "costos_gastos"],
    ["420122", "Depreciación", "deudora", "costos_gastos"],
  ] as const) {
    const r = await c.query(
      `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, $4, $5) returning id`,
      [esc.empresaId, codigo, nombre, naturaleza, tipo],
    );
    esc.cuentas[codigo] = r.rows[0].id as string;
  }
  const a = await c.query(
    `insert into activos_fijos (empresa_id, sucursal_id, nombre, categoria, cuenta_activo_id, cuenta_depreciacion_id,
       cuenta_gasto_id, costo, fecha_adquisicion, vida_util_anios)
     values ($1, $2, 'Mobiliario', 'mobiliario_equipo', $3, $4, $5, 2500, '2026-10-01', 2) returning id`,
    [esc.empresaId, esc.sucursalId, esc.cuentas["120105"], esc.cuentas["120204"], esc.cuentas["420122"]],
  );
  activoId = a.rows[0].id as string;
  partidaId = await crearPartida(
    c,
    esc,
    "2026-10-31",
    [
      [esc.cuentas["420122"]!, "104.17", "0"],
      [esc.cuentas["120204"]!, "0", "104.17"],
    ],
    "ajuste",
  );
  await contabilizar(c, partidaId);
});
afterAll(async () => {
  await c?.end();
});

const insertar = (mes: string, cuota = "104.17") =>
  c.query(
    `insert into depreciaciones (empresa_id, activo_id, mes, cuota, acumulada, partida_id) values ($1, $2, $3, $4, $4, $5) returning id`,
    [esc.empresaId, activoId, mes, cuota, partidaId],
  );

describe("depreciaciones", () => {
  it("registra la cuota del mes y no admite la misma dos veces", async () => {
    await insertar("2026-10-01");
    await expect(insertar("2026-10-01")).rejects.toThrow(/depreciaciones_activo_id_mes_key/);
  });

  it("el mes es el primer día y la cuota es positiva", async () => {
    await expect(insertar("2026-11-15")).rejects.toThrow(/depreciaciones_mes_check/);
    await expect(insertar("2026-11-01", "0")).rejects.toThrow(/depreciaciones_cuota_check/);
  });

  it("una cuota registrada no se modifica ni se borra", async () => {
    await expect(c.query("update depreciaciones set cuota = 1")).rejects.toThrow(
      /no se modifican ni se borran/,
    );
    await expect(c.query("delete from depreciaciones")).rejects.toThrow(/no se modifican ni se borran/);
  });

  it("el activo depreciado no admite cambiar su costo", async () => {
    await c.query(
      "update activos_fijos set depreciacion_acumulada = 104.17, ultimo_mes_depreciado = '2026-10-01' where id = $1",
      [activoId],
    );
    await expect(c.query("update activos_fijos set costo = 3000 where id = $1", [activoId])).rejects.toThrow(
      /ya tiene depreciación/,
    );
  });
});
