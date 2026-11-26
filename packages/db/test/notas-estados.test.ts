// Notas a los estados financieros (migración 20261201100000_notas_estados, HU-44, S3-T31 y S3-T33).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let otra: Escenario;
let ejercicio: string;
let ejercicioOtra: string;
const USUARIO = "a1111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "0614-020290-102-6");
  const e = await c.query(`select id, empresa_id from ejercicios`);
  ejercicio = e.rows.find((f) => f.empresa_id === esc.empresaId).id;
  ejercicioOtra = e.rows.find((f) => f.empresa_id === otra.empresaId).id;
  await c.query(`insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'c@prueba.sv')`, [
    USUARIO,
  ]);
});
afterAll(async () => {
  await c?.end();
});

const guardar = (clave: string, texto: string, empresa = esc.empresaId, ej = ejercicio) =>
  c.query(
    `insert into notas_estados (empresa_id, ejercicio_id, clave, texto) values ($1, $2, $3, $4) returning version`,
    [empresa, ej, clave, texto],
  );

describe("versiones de las notas", () => {
  it("numera las versiones por nota: 1, 2, 3…, sin importar el valor que se envíe", async () => {
    expect((await guardar("entidad", "Primera")).rows[0].version).toBe(1);
    expect((await guardar("entidad", "Segunda")).rows[0].version).toBe(2);
    expect((await guardar("capital", "Otra nota")).rows[0].version).toBe(1);
    const r = await c.query(
      `insert into notas_estados (empresa_id, ejercicio_id, clave, texto, version) values ($1, $2, 'entidad', 'Tercera', 99) returning version`,
      [esc.empresaId, ejercicio],
    );
    expect(r.rows[0].version).toBe(3);
  });

  it("guarda quién la redactó cuando la API fija el usuario de la transacción", async () => {
    await c.query("begin");
    await c.query(`select set_config('app.usuario_id', $1, true)`, [USUARIO]);
    await guardar("politicas", "Con autor");
    await c.query("commit");
    const r = await c.query(`select creado_por from notas_estados where clave = 'politicas'`);
    expect(r.rows[0].creado_por).toBe(USUARIO);
    const b = await c.query(
      `select usuario_id, accion from bitacora where tabla = 'notas_estados' and datos_nuevos ->> 'clave' = 'politicas'`,
    );
    expect(b.rows).toEqual([{ usuario_id: USUARIO, accion: "INSERT" }]);
  });

  it("la nota de otra empresa o de otro ejercicio lleva su propia numeración", async () => {
    expect((await guardar("entidad", "De la otra", otra.empresaId, ejercicioOtra)).rows[0].version).toBe(1);
  });

  it("el historial no se modifica, no se borra ni se vacía", async () => {
    expect(await errorDe(c, `update notas_estados set texto = 'x' where clave = 'entidad'`)).toMatch(
      /inmutable/,
    );
    expect(await errorDe(c, `delete from notas_estados where clave = 'entidad'`)).toMatch(/inmutable/);
    expect(await errorDe(c, `truncate notas_estados`)).toMatch(/inmutable/);
  });
});

describe("reglas de la nota", () => {
  it("el ejercicio debe ser de la empresa", async () => {
    expect(
      await errorDe(
        c,
        `insert into notas_estados (empresa_id, ejercicio_id, clave, texto) values ($1, $2, 'entidad', 'x')`,
        [esc.empresaId, ejercicioOtra],
      ),
    ).toMatch(/ejercicio no pertenece/);
  });

  it("rechaza texto vacío, texto de más de 5,000 caracteres y claves inválidas", async () => {
    expect(
      await errorDe(
        c,
        `insert into notas_estados (empresa_id, ejercicio_id, clave, texto) values ($1, $2, 'entidad', '   ')`,
        [esc.empresaId, ejercicio],
      ),
    ).toMatch(/notas_estados_texto_valido/);
    expect(
      await errorDe(
        c,
        `insert into notas_estados (empresa_id, ejercicio_id, clave, texto) values ($1, $2, 'entidad', repeat('a', 5001))`,
        [esc.empresaId, ejercicio],
      ),
    ).toMatch(/notas_estados_texto_valido/);
    expect(
      await errorDe(
        c,
        `insert into notas_estados (empresa_id, ejercicio_id, clave, texto) values ($1, $2, 'Entidad Uno', 'x')`,
        [esc.empresaId, ejercicio],
      ),
    ).toMatch(/notas_estados_clave_valida/);
  });
});
