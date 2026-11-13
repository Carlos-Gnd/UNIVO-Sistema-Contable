// Perfiles en usuarios para las cuentas de Supabase Auth (migración 20261113000000_perfiles_auth).
// El esquema auth solo existe en Supabase: aquí se simula auth.users con las columnas que usa el trigger,
// y las cuentas se insertan con un rol sin permisos sobre usuarios ni sobre el esquema interno, como hace
// supabase_auth_admin en Supabase.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reiniciarBase, URL_PRUEBAS } from "./helpers";

let c: pg.Client;

const ROL_AUTH = "auth_admin_prueba";

/** Ejecuta una sentencia con el rol de Auth, en su propia transacción. */
async function comoAuth(sql: string, params: unknown[]) {
  await c.query("begin");
  try {
    await c.query(`set local role ${ROL_AUTH}`);
    await c.query(sql, params);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

/** Inserta una cuenta en auth.users como lo haría Supabase Auth. */
const registrarCuenta = (id: string, email: string | null, meta: Record<string, string> = {}) =>
  comoAuth("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email, meta]);

const perfil = async (id: string) =>
  (await c.query("select correo, nombre from usuarios where id = $1", [id])).rows[0] as
    { correo: string; nombre: string } | undefined;

beforeAll(async () => {
  // auth se borra antes de aplicar las migraciones, para que no instalen nada con datos de otra corrida
  const previo = new pg.Client({ connectionString: URL_PRUEBAS });
  await previo.connect();
  await previo.query("drop schema if exists auth cascade");
  await previo.end();

  c = await reiniciarBase();
  await c.query(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = '${ROL_AUTH}') then create role ${ROL_AUTH}; end if;
    end $$;
    grant usage on schema auth to ${ROL_AUTH};
    grant select, insert, update on auth.users to ${ROL_AUTH};`);
});

afterAll(async () => {
  await c?.query("drop schema if exists auth cascade");
  await c?.end();
});

describe("perfiles de Supabase Auth", () => {
  it("fuera de Supabase la instalación no hace nada", async () => {
    await c.query("alter schema auth rename to auth_oculto");
    try {
      expect((await c.query("select interno.instalar_perfiles_auth() as r")).rows[0].r).toBe(false);
    } finally {
      await c.query("alter schema auth_oculto rename to auth");
    }
  });

  it("crea los perfiles de las cuentas que ya existían al instalarse", async () => {
    await c.query(
      `insert into auth.users (id, email, raw_user_meta_data) values
         ('a1111111-1111-4111-8111-111111111111', ' Ana@Ejemplo.com ', '{"nombre": "Ana Pérez"}')`,
    );
    expect((await c.query("select interno.instalar_perfiles_auth() as r")).rows[0].r).toBe(true);
    expect(await perfil("a1111111-1111-4111-8111-111111111111")).toEqual({
      correo: "ana@ejemplo.com",
      nombre: "Ana Pérez",
    });
    // es idempotente
    expect((await c.query("select interno.instalar_perfiles_auth() as r")).rows[0].r).toBe(true);
  });

  it("crea el perfil al registrarse una cuenta, aunque Auth no tenga permisos sobre usuarios", async () => {
    await registrarCuenta("b2222222-2222-4222-8222-222222222222", "Beto.Lopez@ejemplo.com");
    expect(await perfil("b2222222-2222-4222-8222-222222222222")).toEqual({
      correo: "beto.lopez@ejemplo.com",
      nombre: "Beto.Lopez",
    });
    await registrarCuenta("c3333333-3333-4333-8333-333333333333", "carla@ejemplo.com", {
      full_name: "Carla Ruiz",
    });
    expect((await perfil("c3333333-3333-4333-8333-333333333333"))?.nombre).toBe("Carla Ruiz");
  });

  it("nunca hace fallar el registro en Auth", async () => {
    // correo que ya tiene otro perfil (por ejemplo, una cuenta borrada y creada de nuevo)
    await registrarCuenta("d4444444-4444-4444-8444-444444444444", "ana@ejemplo.com");
    expect(await perfil("d4444444-4444-4444-8444-444444444444")).toBeUndefined();
    // cuenta sin correo (solo teléfono)
    await registrarCuenta("e5555555-5555-4555-8555-555555555555", null);
    expect(await perfil("e5555555-5555-4555-8555-555555555555")).toBeUndefined();
    // la API ya había creado el perfil (asegurarUsuario): se conserva
    await c.query("insert into usuarios (id, correo, nombre) values ($1, 'fer@ejemplo.com', 'Fernanda')", [
      "f6666666-6666-4666-8666-666666666666",
    ]);
    await registrarCuenta("f6666666-6666-4666-8666-666666666666", "fer@ejemplo.com");
    expect((await perfil("f6666666-6666-4666-8666-666666666666"))?.nombre).toBe("Fernanda");
  });

  it("mantiene el correo al día y no bloquea el cambio si el nuevo ya es de otro perfil", async () => {
    const id = "b2222222-2222-4222-8222-222222222222";
    const cambiarCorreo = (correo: string) =>
      comoAuth("update auth.users set email = $1 where id = $2", [correo, id]);
    await cambiarCorreo("Roberto@Ejemplo.com");
    expect((await perfil(id))?.correo).toBe("roberto@ejemplo.com");

    await cambiarCorreo("carla@ejemplo.com"); // ya es de Carla: Auth lo acepta y el perfil conserva el suyo
    expect((await perfil(id))?.correo).toBe("roberto@ejemplo.com");
  });

  it("deja el alta del perfil en la bitácora", async () => {
    const r = await c.query(
      "select accion from bitacora where tabla = 'usuarios' and registro_id = $1 order by id",
      ["b2222222-2222-4222-8222-222222222222"],
    );
    expect(r.rows.map((x) => x.accion)).toEqual(["INSERT", "UPDATE"]);
  });
});
