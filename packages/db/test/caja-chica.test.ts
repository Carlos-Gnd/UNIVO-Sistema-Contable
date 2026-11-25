// Caja chica de fondo fijo y vales inmutables (HU-77, S3-T115).
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let otra: Escenario;
let cuentaCajaChica: string;
let cuentaCajaChicaDos: string;
let cuentaOrigen: string;
let cuentaGasto: string;
let cuentaIva: string;
let cajaTesoreriaId: string;
let cajaTesoreriaDosId: string;
let cajaTesoreriaAjenaId: string;
let cajaTesoreriaCuentaGeneralId: string;
let cajaChicaId: string;
let valeId: string;
let partidaAperturaId: string;
let partidaReintegroId: string;

async function agregarCuenta(
  empresa: Escenario,
  codigo: string,
  nombre: string,
  tipo: "activo" | "costos_gastos" = "activo",
) {
  const resultado = await c.query(
    `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, 'deudora', $4) returning id`,
    [empresa.empresaId, codigo, nombre, tipo],
  );
  return resultado.rows[0].id as string;
}

async function agregarCajaTesoreria(
  empresa: Escenario,
  cuentaId: string,
  nombre: string,
  sucursalId = empresa.sucursalId,
) {
  const resultado = await c.query(
    `insert into cuentas_tesoreria (empresa_id, sucursal_id, cuenta_id, tipo, nombre)
     values ($1, $2, $3, 'caja', $4) returning id`,
    [empresa.empresaId, sucursalId, cuentaId, nombre],
  );
  return resultado.rows[0].id as string;
}

async function crearApertura(
  empresa: Escenario,
  cuentaCajaId: string,
  tesoreriaId: string,
  fondo = "200.00",
  sucursalId = empresa.sucursalId,
) {
  const id = randomUUID();
  const partida = await c.query(
    `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
     values ($1, $2, '2026-10-01', 'operacion', 'Apertura de caja chica', 'caja_chica_apertura', $3) returning id`,
    [empresa.empresaId, sucursalId, id],
  );
  const partidaId = partida.rows[0].id as string;
  await c.query(
    `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values
     ($1, $2, $4, 0, 0), ($1, $3, 0, $4, 1)`,
    [partidaId, cuentaCajaId, cuentaOrigen, fondo],
  );
  await c.query(
    `insert into cajas_chicas (id, empresa_id, sucursal_id, cuenta_tesoreria_id, fondo_fijo, partida_apertura_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, empresa.empresaId, sucursalId, tesoreriaId, fondo, partidaId],
  );
  return { id, partidaId };
}

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "0614-010190-102-0");
  await agregarCuenta(esc, "110102", "Caja chica", "activo");
  cuentaCajaChica = await agregarCuenta(esc, "11010201", "Caja chica matriz", "activo");
  cuentaCajaChicaDos = await agregarCuenta(esc, "11010202", "Caja chica secundaria", "activo");
  cuentaOrigen = esc.cuentas["110101"]!;
  await agregarCuenta(esc, "52", "Costos y gastos", "costos_gastos");
  cuentaGasto = await agregarCuenta(esc, "5201", "Gastos generales", "costos_gastos");
  cuentaIva = await agregarCuenta(esc, "1112", "Crédito Fiscal IVA", "activo");
  cajaTesoreriaId = await agregarCajaTesoreria(esc, cuentaCajaChica, "Caja chica matriz");
  cajaTesoreriaDosId = await agregarCajaTesoreria(esc, cuentaCajaChicaDos, "Caja chica secundaria");
  cajaTesoreriaCuentaGeneralId = await agregarCajaTesoreria(esc, cuentaOrigen, "Caja general");
  cajaTesoreriaAjenaId = await agregarCajaTesoreria(otra, otra.cuentas["110101"]!, "Caja ajena");
  const apertura = await crearApertura(esc, cuentaCajaChica, cajaTesoreriaId);
  cajaChicaId = apertura.id;
  partidaAperturaId = apertura.partidaId;
});

afterAll(async () => {
  await c?.end();
});

describe("fondo fijo y vales de caja chica", () => {
  it("abre un fondo por sucursal y exige una cuenta 110102 activa e imputable", async () => {
    const resultado = await c.query(
      `select cc.fondo_fijo::text, p.estado::text, p.origen, p.origen_id::text
       from cajas_chicas cc join partidas p on p.id = cc.partida_apertura_id where cc.id = $1`,
      [cajaChicaId],
    );
    expect(resultado.rows[0]).toMatchObject({
      fondo_fijo: "200.00",
      estado: "borrador",
      origen: "caja_chica_apertura",
      origen_id: cajaChicaId,
    });
    const otraApertura = randomUUID();
    const partida = await c.query(
      `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
       values ($1, $2, '2026-10-02', 'operacion', 'Apertura duplicada', 'caja_chica_apertura', $3) returning id`,
      [esc.empresaId, esc.sucursalId, otraApertura],
    );
    const partidaId = partida.rows[0].id as string;
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values
       ($1, $2, 200, 0, 0), ($1, $3, 0, 200, 1)`,
      [partidaId, cuentaCajaChicaDos, cuentaOrigen],
    );
    expect(
      await errorDe(
        c,
        `insert into cajas_chicas (id, empresa_id, sucursal_id, cuenta_tesoreria_id, fondo_fijo, partida_apertura_id)
         values ($1, $2, $3, $4, 200, $5)`,
        [otraApertura, esc.empresaId, esc.sucursalId, cajaTesoreriaDosId, partidaId],
      ),
    ).toMatch(/cajas_chicas_empresa_id_sucursal_id_key/);
  });

  it("rechaza una caja de otra empresa y un fondo con cuenta contable distinta de 110102", async () => {
    const idAjeno = randomUUID();
    const partidaAjena = await c.query(
      `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
       values ($1, $2, '2026-10-03', 'operacion', 'Apertura ajena', 'caja_chica_apertura', $3) returning id`,
      [esc.empresaId, esc.sucursalId, idAjeno],
    );
    const pAjenaId = partidaAjena.rows[0].id as string;
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values
       ($1, $2, 200, 0, 0), ($1, $3, 0, 200, 1)`,
      [pAjenaId, cuentaOrigen, cuentaCajaChica],
    );
    expect(
      await errorDe(
        c,
        `insert into cajas_chicas (id, empresa_id, sucursal_id, cuenta_tesoreria_id, fondo_fijo, partida_apertura_id)
         values ($1, $2, $3, $4, 200, $5)`,
        [idAjeno, esc.empresaId, esc.sucursalId, cajaTesoreriaAjenaId, pAjenaId],
      ),
    ).toMatch(/no existe en esta empresa/);

    const idIncorrecto = randomUUID();
    const partidaIncorrecta = await c.query(
      `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
       values ($1, $2, '2026-10-04', 'operacion', 'Apertura incorrecta', 'caja_chica_apertura', $3) returning id`,
      [esc.empresaId, esc.sucursalId, idIncorrecto],
    );
    const pIncorrectaId = partidaIncorrecta.rows[0].id as string;
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values
       ($1, $2, 200, 0, 0), ($1, $3, 0, 200, 1)`,
      [pIncorrectaId, cuentaOrigen, cuentaCajaChica],
    );
    expect(
      await errorDe(
        c,
        `insert into cajas_chicas (id, empresa_id, sucursal_id, cuenta_tesoreria_id, fondo_fijo, partida_apertura_id)
         values ($1, $2, $3, $4, 200, $5)`,
        [idIncorrecto, esc.empresaId, esc.sucursalId, cajaTesoreriaCuentaGeneralId, pIncorrectaId],
      ),
    ).toMatch(/código 110102/);
  });

  it("acepta vales hasta el fondo fijo y bloquea el exceso", async () => {
    const creado = await c.query(
      `insert into vales_caja_chica (empresa_id, caja_chica_id, fecha, comprobante, concepto, monto_neto, iva, cuenta_gasto_id)
       values ($1, $2, '2026-10-05', 'F-001', 'Papelería', 150, 19.50, $3) returning id`,
      [esc.empresaId, cajaChicaId, cuentaGasto],
    );
    valeId = creado.rows[0].id as string;
    expect(
      String(
        await errorDe(
          c,
          `insert into vales_caja_chica (empresa_id, caja_chica_id, fecha, comprobante, concepto, monto_neto, iva, cuenta_gasto_id)
         values ($1, $2, '2026-10-06', 'F-002', 'Repuestos', 31, 0, $3)`,
          [esc.empresaId, cajaChicaId, cuentaGasto],
        ),
      ),
    ).toMatch(/supera el efectivo disponible/);
    expect(
      await errorDe(
        c,
        `insert into vales_caja_chica (empresa_id, caja_chica_id, fecha, comprobante, concepto, monto_neto, iva, cuenta_gasto_id)
         values ($1, $2, '2026-10-06', 'F-003', 'Vale sin importe', 0, 0, $3)`,
        [esc.empresaId, cajaChicaId, cuentaGasto],
      ),
    ).toMatch(/vales_caja_chica_importes_validos/);
  });

  it("solo reintegra el vale una vez y conserva su historial", async () => {
    const partida = await c.query(
      `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
       values ($1, $2, '2026-10-07', 'operacion', 'Reintegro', 'caja_chica_reintegro', $3) returning id`,
      [esc.empresaId, esc.sucursalId, cajaChicaId],
    );
    partidaReintegroId = partida.rows[0].id as string;
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values
       ($1, $2, 150, 0, 0), ($1, $3, 19.50, 0, 1), ($1, $4, 0, 169.50, 2)`,
      [partidaReintegroId, cuentaGasto, cuentaIva, cuentaOrigen],
    );
    expect(
      await errorDe(
        c,
        `update vales_caja_chica set estado = 'reintegrado', partida_reintegro_id = $2 where id = $1`,
        [valeId, partidaReintegroId],
      ),
    ).toBeNull();
    const vale = await c.query(
      `select estado::text, partida_reintegro_id::text from vales_caja_chica where id = $1`,
      [valeId],
    );
    expect(vale.rows[0]).toEqual({ estado: "reintegrado", partida_reintegro_id: partidaReintegroId });
    expect(
      await errorDe(c, `update vales_caja_chica set concepto = 'Modificado' where id = $1`, [valeId]),
    ).toMatch(/inmutable/);
    expect(
      await errorDe(
        c,
        `update vales_caja_chica set estado = 'por_reintegrar', partida_reintegro_id = null where id = $1`,
        [valeId],
      ),
    ).toMatch(/inmutable/);
    expect(await errorDe(c, `delete from vales_caja_chica where id = $1`, [valeId])).toMatch(
      /no se eliminan/,
    );
    expect(String(await errorDe(c, `truncate vales_caja_chica`))).toMatch(/No se puede vaciar/);
  });

  it("registra la bitácora y no permite borrar ni cambiar la apertura", async () => {
    const acciones = await c.query(
      `select distinct accion from bitacora where empresa_id = $1 and tabla in ('cajas_chicas', 'vales_caja_chica')`,
      [esc.empresaId],
    );
    expect(acciones.rows.map((fila) => fila.accion)).toEqual(expect.arrayContaining(["INSERT", "UPDATE"]));
    expect(await errorDe(c, `update cajas_chicas set fondo_fijo = 250 where id = $1`, [cajaChicaId])).toMatch(
      /apertura de caja chica es inmutable/,
    );
    expect(await errorDe(c, `delete from cajas_chicas where id = $1`, [cajaChicaId])).toMatch(
      /apertura de caja chica es inmutable/,
    );
    expect(String(await errorDe(c, `truncate cajas_chicas`))).toMatch(
      /cannot truncate a table referenced in a foreign key constraint/,
    );
    expect(partidaAperturaId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
