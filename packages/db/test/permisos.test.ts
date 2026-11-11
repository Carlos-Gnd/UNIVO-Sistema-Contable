import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reiniciarBase } from "./helpers";

let c: pg.Client;
const permisosDe = async (rol: string) =>
  (
    await c.query(
      `select p.modulo || '.' || p.accion as permiso from rol_permisos rp join roles r on r.id = rp.rol_id
       join permisos p on p.id = rp.permiso_id where r.codigo = $1`,
      [rol],
    )
  ).rows.map((r) => r.permiso as string);

beforeAll(async () => {
  c = await reiniciarBase();
});
afterAll(async () => {
  await c?.end();
});

describe("matriz de permisos", () => {
  it("crea los cuatro roles del sistema", async () => {
    const r = await c.query(`select codigo from roles order by id`);
    expect(r.rows.map((x) => x.codigo)).toEqual(["administrador", "contador", "auxiliar", "consulta"]);
  });

  it("separa funciones: el auxiliar registra pero no contabiliza ni anula", async () => {
    const aux = await permisosDe("auxiliar");
    expect(aux).toContain("partidas.registrar");
    expect(aux).not.toContain("partidas.contabilizar");
    expect(aux).not.toContain("partidas.anular");
  });

  it("solo el administrador gestiona usuarios, restaura respaldos y reabre períodos", async () => {
    for (const p of ["usuarios.gestionar", "respaldo.restaurar", "periodos.reabrir"]) {
      expect(await permisosDe("administrador")).toContain(p);
      expect(await permisosDe("contador")).not.toContain(p);
    }
  });

  it("la planilla es confidencial: auxiliar y consulta no la ven", async () => {
    expect(await permisosDe("auxiliar")).not.toContain("planilla.ver");
    expect(await permisosDe("consulta")).not.toContain("planilla.ver");
  });

  it("el usuario de consulta no tiene ningún permiso de escritura", async () => {
    const escritura = (await permisosDe("consulta")).filter((p) => !/\.(ver|exportar)$/.test(p));
    expect(escritura).toEqual([]);
  });

  it("la vista permisos_usuario resuelve los permisos de una membresía activa", async () => {
    const e = await c.query(
      `insert into empresas (nombre, nit, tipo_contribuyente) values ('X', '0614-090909-109-9', 'sociedad') returning id`,
    );
    const u = "22222222-2222-4222-8222-222222222222";
    await c.query(`insert into usuarios (id, nombre, correo) values ($1, 'Ana', 'ana@ejemplo.com')`, [u]);
    await c.query(`insert into membresias (usuario_id, empresa_id, rol_id) values ($1, $2, 3)`, [
      u,
      e.rows[0].id,
    ]);
    const r = await c.query(
      `select permiso from permisos_usuario where usuario_id = $1 and empresa_id = $2`,
      [u, e.rows[0].id],
    );
    const permisos = r.rows.map((x) => x.permiso);
    expect(permisos).toContain("partidas.registrar");
    expect(permisos).not.toContain("partidas.contabilizar");
  });
});
