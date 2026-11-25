import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

const USUARIO = "11111111-1111-4111-8111-111111111111";
const HASH = "a".repeat(64);

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let esc: Escenario;
let otra: Escenario;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-130001-101-1");
  otra = await crearEscenario(c, "0614-130002-101-2");
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Administrador', 'admin@respaldos.test')",
    [USUARIO],
  );
  await c.query("select set_config('app.usuario_id', $1, false)", [USUARIO]);
});

afterAll(async () => {
  await c?.end();
});

async function insertar(
  tipo: "empresa" | "sucursal",
  empresaId = esc.empresaId,
  sucursalId: string | null = null,
) {
  return c.query(
    "insert into respaldos (empresa_id, sucursal_id, tipo, nombre_archivo, contenido, sha256, creado_por) " +
      "values ($1, $2, $3, 'respaldo.json', '{}'::jsonb, $4, $5) returning id",
    [empresaId, sucursalId, tipo, HASH, USUARIO],
  );
}

describe("respaldos", () => {
  it("valida el tipo de alcance, el hash y que la sucursal sea de la misma empresa", async () => {
    expect(
      await errorDe(
        c,
        "insert into respaldos (empresa_id, sucursal_id, tipo, nombre_archivo, contenido, sha256, creado_por) values ($1, $2, 'empresa', 'x.json', '{}'::jsonb, $3, $4)",
        [esc.empresaId, esc.sucursalId, HASH, USUARIO],
      ),
    ).toMatch(/respaldos_tipo_sucursal_ck/);
    expect(
      await errorDe(
        c,
        "insert into respaldos (empresa_id, tipo, nombre_archivo, contenido, sha256, creado_por) values ($1, 'empresa', 'x.json', '{}'::jsonb, 'ABC', $2)",
        [esc.empresaId, USUARIO],
      ),
    ).toMatch(/respaldos_sha256_ck/);
    expect(
      await errorDe(
        c,
        "insert into respaldos (empresa_id, sucursal_id, tipo, nombre_archivo, contenido, sha256, creado_por) values ($1, $2, 'sucursal', 'x.json', '{}'::jsonb, $3, $4)",
        [esc.empresaId, otra.sucursalId, HASH, USUARIO],
      ),
    ).toMatch(/sucursal del respaldo debe pertenecer a la empresa/);
    expect((await insertar("empresa")).rows).toHaveLength(1);
    expect((await insertar("sucursal", esc.empresaId, esc.sucursalId)).rows).toHaveLength(1);
  });

  it("registra el respaldo en bitácora y bloquea UPDATE y DELETE", async () => {
    const respaldo = (await insertar("empresa")).rows[0] as { id: string };
    const bitacora = await c.query(
      "select usuario_id, accion, tabla from bitacora where tabla = 'respaldos' and registro_id = $1",
      [respaldo.id],
    );
    expect(bitacora.rows).toEqual([{ usuario_id: USUARIO, accion: "INSERT", tabla: "respaldos" }]);
    expect(
      await errorDe(c, "update respaldos set nombre_archivo = 'cambio.json' where id = $1", [respaldo.id]),
    ).toMatch(/respaldos son inmutables/);
    expect(await errorDe(c, "delete from respaldos where id = $1", [respaldo.id])).toMatch(
      /respaldos son inmutables/,
    );
  });

  it("habilita RLS y revoca el acceso directo a anon y authenticated", async () => {
    const rls = await c.query("select relrowsecurity from pg_class where oid = 'public.respaldos'::regclass");
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    const roles = await c.query("select rolname from pg_roles where rolname in ('anon', 'authenticated')");
    for (const { rolname } of roles.rows as { rolname: string }[]) {
      const acceso = await c.query(
        "select has_table_privilege($1, 'public.respaldos', 'select') as puede_leer",
        [rolname],
      );
      expect(acceso.rows[0]?.puede_leer).toBe(false);
    }
  });
});
