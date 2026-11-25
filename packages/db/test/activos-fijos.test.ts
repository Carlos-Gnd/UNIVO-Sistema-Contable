// Reglas de la tabla activos_fijos (migración 20261124000000_activos_fijos, HU-81, S3-T127).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let otra: Escenario;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "0614-020290-102-3");
  // Cuentas de activo fijo para la empresa de la prueba
  for (const [codigo, nombre, naturaleza] of [
    ["12", "Activo no corriente", "deudora"],
    ["1201", "Propiedad, planta y equipo", "deudora"],
    ["120105", "Mobiliario y Equipo", "deudora"],
    ["1202", "(R) Depreciaciones", "acreedora"],
    ["120204", "Depreciación mobiliario", "acreedora"],
    ["4", "Costos y gastos", "deudora"],
    ["42", "Gastos", "deudora"],
    ["4201", "Gastos de administración", "deudora"],
    ["420122", "Depreciación", "deudora"],
  ] as const) {
    const r = await c.query(
      `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, $4, $5) returning id`,
      [esc.empresaId, codigo, nombre, naturaleza, codigo.startsWith("4") ? "costos_gastos" : "activo"],
    );
    esc.cuentas[codigo] = r.rows[0].id as string;
  }
});
afterAll(async () => {
  await c?.end();
});

const insertar = (extra: Record<string, unknown> = {}, empresa = esc) => {
  const d = {
    nombre: "Escritorios",
    categoria: "mobiliario_equipo",
    costo: "2500",
    valor_residual: "0",
    vida: 2,
    ...extra,
  };
  return c.query(
    `insert into activos_fijos (empresa_id, sucursal_id, nombre, categoria, cuenta_activo_id, cuenta_depreciacion_id,
       cuenta_gasto_id, costo, valor_residual, fecha_adquisicion, vida_util_anios)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, '2026-10-01', $10) returning id, codigo`,
    [
      empresa.empresaId,
      empresa.sucursalId,
      d.nombre,
      d.categoria,
      esc.cuentas["120105"],
      esc.cuentas["120204"],
      esc.cuentas["420122"],
      d.costo,
      d.valor_residual,
      d.vida,
    ],
  );
};

describe("activos_fijos", () => {
  it("asigna códigos AF-0001, AF-0002… por empresa, sin saltos", async () => {
    expect((await insertar()).rows[0].codigo).toBe("AF-0001");
    expect((await insertar({ nombre: "Sillas" })).rows[0].codigo).toBe("AF-0002");
  });

  it("rechaza un costo no positivo, un residual igual al costo y una categoría desconocida", async () => {
    await expect(insertar({ costo: "0" })).rejects.toThrow(/activos_fijos_costo_check/);
    await expect(insertar({ valor_residual: "2500" })).rejects.toThrow(/activos_fijos_costo_check/);
    await expect(insertar({ categoria: "terrenos" })).rejects.toThrow(/activos_fijos_categoria_check/);
  });

  it("las cuentas y la sucursal deben ser de la misma empresa", async () => {
    await expect(insertar({}, { ...otra, cuentas: otra.cuentas })).rejects.toThrow(/cuentas del activo/);
  });

  it("la depreciación acumulada no supera la base depreciable", async () => {
    const { id } = (await insertar({ nombre: "Mesas", valor_residual: "500" })).rows[0];
    await expect(
      c.query("update activos_fijos set depreciacion_acumulada = 2100 where id = $1", [id]),
    ).rejects.toThrow(/activos_fijos_acumulada_check/);
    await c.query("update activos_fijos set depreciacion_acumulada = 2000 where id = $1", [id]);
  });

  it("con depreciación registrada no se cambian el costo ni la vida útil", async () => {
    const { id } = (await insertar({ nombre: "Archivos" })).rows[0];
    await c.query("update activos_fijos set depreciacion_acumulada = 104.17 where id = $1", [id]);
    await expect(c.query("update activos_fijos set costo = 3000 where id = $1", [id])).rejects.toThrow(
      /ya tiene depreciación/,
    );
    await expect(c.query("update activos_fijos set vida_util_anios = 5 where id = $1", [id])).rejects.toThrow(
      /ya tiene depreciación/,
    );
    await c.query("update activos_fijos set nombre = 'Archiveros' where id = $1", [id]);
  });

  it("una baja exige su fecha y no se revierte", async () => {
    const { id } = (await insertar({ nombre: "Lámparas" })).rows[0];
    await expect(c.query("update activos_fijos set estado = 'de_baja' where id = $1", [id])).rejects.toThrow(
      /activos_fijos_baja_check/,
    );
    await c.query("update activos_fijos set estado = 'de_baja', fecha_baja = '2026-11-20' where id = $1", [
      id,
    ]);
    await expect(
      c.query("update activos_fijos set estado = 'activo', fecha_baja = null where id = $1", [id]),
    ).rejects.toThrow(/dado de baja/);
  });

  it("los cambios quedan en la bitácora con el usuario", async () => {
    const usuario = "a1111111-1111-4111-8111-111111111111";
    await c.query("begin");
    await c.query("select set_config('app.usuario_id', $1, true)", [usuario]);
    const { id } = (await insertar({ nombre: "Ventiladores" })).rows[0];
    await c.query("commit");
    const r = await c.query(
      `select usuario_id from bitacora where tabla = 'activos_fijos' and registro_id = $1`,
      [id],
    );
    expect(r.rows[0]?.usuario_id).toBe(usuario);
  });
});
