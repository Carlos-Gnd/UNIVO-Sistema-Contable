// Movimientos bancarios, conciliaciones y filas CSV inmutables (HU-78, HU-79 y HU-80).
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  contabilizar,
  crearEscenario,
  crearPartida,
  errorDe,
  reiniciarBase,
  type Escenario,
} from "./helpers";

let c: pg.Client;
let esc: Escenario;
let otra: Escenario;
let usuarioId: string;
let cuentaBanco: string;
let cuentaContrapartida: string;
let cuentaTesoreriaId: string;

async function agregarCuenta(empresa: Escenario, codigo: string, nombre: string) {
  const resultado = await c.query(
    "insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, 'deudora', 'activo') returning id",
    [empresa.empresaId, codigo, nombre],
  );
  return resultado.rows[0]!.id as string;
}

async function agregarBanco(empresa: Escenario, cuentaId: string, nombre: string) {
  const resultado = await c.query(
    `insert into cuentas_tesoreria (empresa_id, sucursal_id, cuenta_id, tipo, nombre, banco, numero_cuenta)
     values ($1, $2, $3, 'banco', $4, 'Banco de prueba', $5) returning id`,
    [empresa.empresaId, empresa.sucursalId, cuentaId, nombre, randomUUID().slice(0, 12)],
  );
  return resultado.rows[0]!.id as string;
}

async function crearMovimiento(
  tipo = "cheque",
  referencia = `CH-${randomUUID().slice(0, 8)}`,
  monto = "226.00",
  fecha = "2026-10-05",
) {
  const id = randomUUID();
  const partida = await c.query(
    `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
     values ($1, $2, $4, 'operacion', 'Prueba de cheque', 'movimiento_bancario', $3) returning id`,
    [esc.empresaId, esc.sucursalId, id, fecha],
  );
  const partidaId = partida.rows[0]!.id as string;
  await c.query(
    `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values
     ($1, $2, $4, $5, 0), ($1, $3, $6, $7, 1)`,
    [
      partidaId,
      tipo === "cheque" ? cuentaContrapartida : cuentaBanco,
      tipo === "cheque" ? cuentaBanco : cuentaContrapartida,
      monto,
      "0.00",
      "0.00",
      monto,
    ],
  );
  const insertada = await c.query(
    `insert into movimientos_bancarios
       (id, empresa_id, cuenta_tesoreria_id, sucursal_id, cuenta_contrapartida_id, tipo, fecha,
        referencia, comprobante, concepto, monto, estado_cheque, partida_id)
     values ($1, $2, $3, $4, $5, $6::tipo_movimiento_bancario, $10, $7, $8, 'Pago de prueba', $11,
             CASE WHEN $6::tipo_movimiento_bancario = 'cheque'::tipo_movimiento_bancario THEN 'emitido'::estado_cheque_bancario ELSE NULL END, $9)
     returning id`,
    [
      id,
      esc.empresaId,
      cuentaTesoreriaId,
      esc.sucursalId,
      cuentaContrapartida,
      tipo,
      referencia,
      `F-${referencia}`,
      partidaId,
      fecha,
      monto,
    ],
  );
  return { id: insertada.rows[0]!.id as string, partidaId, referencia };
}

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-780101-101-1");
  otra = await crearEscenario(c, "0614-780102-101-2");
  usuarioId = randomUUID();
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Contador prueba', 'conciliacion@test.local')",
    [usuarioId],
  );
  await agregarCuenta(esc, "110104", "Bancos");
  cuentaBanco = await agregarCuenta(esc, "11010401", "Banco de prueba");
  await agregarCuenta(esc, "2", "Pasivo");
  await agregarCuenta(esc, "21", "Pasivo corriente");
  await agregarCuenta(esc, "2101", "Cuentas por pagar");
  cuentaContrapartida = await agregarCuenta(esc, "210101", "Proveedores");
  cuentaTesoreriaId = await agregarBanco(esc, cuentaBanco, "Banco de prueba");
  await agregarBanco(otra, otra.cuentas["110101"]!, "Banco ajeno");
});

afterAll(async () => {
  await c?.end();
});

describe("movimientos y conciliación bancarios", () => {
  it("exige partida en borrador balanceada y referencia única por banco", async () => {
    const movimiento = await crearMovimiento();
    const partida = await c.query(
      "select estado::text, origen, origen_id::text from partidas where id = $1",
      [movimiento.partidaId],
    );
    expect(partida.rows[0]).toMatchObject({
      estado: "borrador",
      origen: "movimiento_bancario",
      origen_id: movimiento.id,
    });
    await expect(crearMovimiento("cheque", movimiento.referencia)).rejects.toThrow(
      /movimientos_bancarios_empresa_id_cuenta_tesoreria_id_referencia/,
    );
    expect(await errorDe(c, "delete from movimientos_bancarios where id = $1", [movimiento.id])).toMatch(
      /no se eliminan/,
    );
    expect(
      await errorDe(c, "update movimientos_bancarios set concepto = 'Cambio' where id = $1", [movimiento.id]),
    ).toMatch(/inmutable/);
    expect(await errorDe(c, "truncate movimientos_bancarios")).toMatch(/vaciar el historial/);
  });

  it("solo permite emitir y luego cobrar o anular un cheque con partida inversa", async () => {
    const cobrado = await crearMovimiento("cheque");
    await c.query(
      "update movimientos_bancarios set estado_cheque = 'cobrado', fecha_estado = '2026-10-10' where id = $1",
      [cobrado.id],
    );
    expect(
      await errorDe(c, "update movimientos_bancarios set estado_cheque = 'anulado' where id = $1", [
        cobrado.id,
      ]),
    ).toMatch(/inmutable/);

    const anulado = await crearMovimiento("cheque");
    const reversion = await c.query(
      `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
       values ($1, $2, '2026-10-10', 'operacion', 'Anulación', 'movimiento_bancario_anulacion', $3) returning id`,
      [esc.empresaId, esc.sucursalId, anulado.id],
    );
    const reversionId = reversion.rows[0]!.id as string;
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values
       ($1, $2, 226, 0, 0), ($1, $3, 0, 226, 1)`,
      [reversionId, cuentaBanco, cuentaContrapartida],
    );
    await c.query(
      "update movimientos_bancarios set estado_cheque = 'anulado', fecha_estado = '2026-10-10', partida_anulacion_id = $2 where id = $1",
      [anulado.id, reversionId],
    );
    expect(
      await errorDe(c, "update movimientos_bancarios set concepto = 'Cambio' where id = $1", [anulado.id]),
    ).toMatch(/inmutable/);
  });

  it("marca solo líneas contabilizadas de la misma cuenta y conserva el estado", async () => {
    const partida = await crearPartida(c, esc, "2026-10-12", [
      [cuentaBanco, "100.00", "0.00"],
      [cuentaContrapartida, "0.00", "100.00"],
    ]);
    await contabilizar(c, partida);
    const linea = await c.query("select id from partida_detalles where partida_id = $1 and cuenta_id = $2", [
      partida,
      cuentaBanco,
    ]);
    const corte = await c.query(
      `insert into conciliaciones_bancarias (empresa_id, cuenta_tesoreria_id, fecha_corte, saldo_estado, creado_por)
       values ($1, $2, '2026-10-31', 100, $3) returning id`,
      [esc.empresaId, cuentaTesoreriaId, usuarioId],
    );
    const corteId = corte.rows[0]!.id as string;
    await c.query(
      "insert into detalles_conciliacion_bancaria (empresa_id, conciliacion_id, partida_detalle_id) values ($1, $2, $3)",
      [esc.empresaId, corteId, linea.rows[0]!.id],
    );
    await c.query("update detalles_conciliacion_bancaria set conciliado = true where conciliacion_id = $1", [
      corteId,
    ]);
    expect(
      await c.query("select conciliado from detalles_conciliacion_bancaria where conciliacion_id = $1", [
        corteId,
      ]),
    ).toMatchObject({ rows: [{ conciliado: true }] });
    expect(
      await errorDe(c, "delete from detalles_conciliacion_bancaria where conciliacion_id = $1", [corteId]),
    ).toMatch(/no se eliminan/);

    const borrador = await crearPartida(c, esc, "2026-10-13", [
      [cuentaBanco, "1.00", "0.00"],
      [cuentaContrapartida, "0.00", "1.00"],
    ]);
    const lineaBorrador = await c.query(
      "select id from partida_detalles where partida_id = $1 and cuenta_id = $2",
      [borrador, cuentaBanco],
    );
    expect(
      await errorDe(
        c,
        "insert into detalles_conciliacion_bancaria (empresa_id, conciliacion_id, partida_detalle_id) values ($1, $2, $3)",
        [esc.empresaId, corteId, lineaBorrador.rows[0]!.id],
      ),
    ).toMatch(/contabilizado/);
    expect(
      await errorDe(
        c,
        "insert into detalles_conciliacion_bancaria (empresa_id, conciliacion_id, partida_detalle_id) values ($1, $2, $3)",
        [otra.empresaId, corteId, linea.rows[0]!.id],
      ),
    ).toMatch(/línea debe ser/);
  });

  it("guarda CSV importado de forma inmutable y limita la coincidencia al banco y la referencia exactos", async () => {
    const movimiento = await crearMovimiento("remesa", "REF-75", "75.00", "2026-10-20");
    await contabilizar(c, movimiento.partidaId);
    const linea = await c.query("select id from partida_detalles where partida_id = $1 and cuenta_id = $2", [
      movimiento.partidaId,
      cuentaBanco,
    ]);
    const corte = await c.query(
      `insert into conciliaciones_bancarias (empresa_id, cuenta_tesoreria_id, fecha_corte, saldo_estado, creado_por)
       values ($1, $2, '2026-10-30', 75, $3) returning id`,
      [esc.empresaId, cuentaTesoreriaId, usuarioId],
    );
    const id = randomUUID();
    await c.query(
      `insert into lineas_estado_cuenta
        (id, empresa_id, conciliacion_id, numero_fila, fecha, referencia, descripcion, monto, huella, partida_detalle_id)
       values ($1, $2, $3, 2, '2026-10-20', 'REF-75', 'Depósito', 75, $4, $5)`,
      [id, esc.empresaId, corte.rows[0]!.id, "a".repeat(64), linea.rows[0]!.id],
    );
    expect(
      await errorDe(
        c,
        `insert into lineas_estado_cuenta (empresa_id, conciliacion_id, numero_fila, fecha, referencia, descripcion, monto, huella)
       values ($1, $2, 3, '2026-10-20', 'REF-75', 'Depósito', 75, $3)`,
        [esc.empresaId, corte.rows[0]!.id, "a".repeat(64)],
      ),
    ).toMatch(/lineas_estado_cuenta_conciliacion_huella_key/);
    expect(await errorDe(c, "delete from lineas_estado_cuenta where id = $1", [id])).toMatch(/inmutables/);
    expect(await errorDe(c, "truncate lineas_estado_cuenta")).toMatch(/vaciar el historial/);
    expect(
      await errorDe(
        c,
        `insert into lineas_estado_cuenta
        (empresa_id, conciliacion_id, numero_fila, fecha, referencia, descripcion, monto, huella, partida_detalle_id)
       values ($1, $2, 4, '2026-10-21', 'REF-75', 'Incorrecto', 75, $3, $4)`,
        [esc.empresaId, corte.rows[0]!.id, "b".repeat(64), linea.rows[0]!.id],
      ),
    ).toMatch(/coincidencia debe tener igual fecha/);
  });
});
