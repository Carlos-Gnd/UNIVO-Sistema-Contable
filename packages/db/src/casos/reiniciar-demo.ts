import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

/** Valida el destino de carga y devuelve si el servidor indicado en la autoridad de la URL es local. */
export function validarUrlCargaDemo(url: string): boolean {
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    throw new Error("CASO_DATABASE_URL no es una URL válida.");
  }
  if (destino.protocol !== "postgres:" && destino.protocol !== "postgresql:") {
    throw new Error("CASO_DATABASE_URL debe usar el protocolo PostgreSQL.");
  }
  if (destino.search !== "" || destino.hash !== "") {
    throw new Error("La carga del caso no permite parámetros de conexión en la URL.");
  }
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(destino.hostname);
}

/** Solo permite borrar la base local dedicada a la demostración. */
export function validarReinicioDemo(url: string, confirmar: string | undefined): void {
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    throw new Error("CASO_DATABASE_URL no es una URL válida.");
  }

  if (!validarUrlCargaDemo(url)) {
    throw new Error("El reinicio de la demo solo se permite en una base PostgreSQL local.");
  }
  if (destino.pathname !== "/contable_demo") {
    throw new Error("El reinicio solo se permite en la base dedicada contable_demo.");
  }
  if (confirmar !== "1") {
    throw new Error("Defina CASO_CONFIRMAR_REINICIO=1 para confirmar el borrado de contable_demo.");
  }
}

/** Recrea el esquema de la base demo y aplica todas las migraciones del repositorio. */
export async function reiniciarBaseDemo(c: pg.Client): Promise<void> {
  const destino = await c.query<{
    base_correcta: boolean;
    servidor_local: boolean;
  }>(`select current_database() = 'contable_demo' as base_correcta,
             (inet_server_addr() << inet '127.0.0.0/8' or inet_server_addr() = inet '::1') as servidor_local`);
  if (!destino.rows[0]?.base_correcta || !destino.rows[0]?.servidor_local) {
    throw new Error("El reinicio exige estar conectado a contable_demo en un servidor local.");
  }
  await c.query("select pg_advisory_lock(hashtext('contable_demo_reset'))");
  try {
    await c.query(
      "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS interno CASCADE; CREATE SCHEMA public;",
    );
    await c.query(`
      CREATE TABLE public."_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    const migraciones = path.resolve(import.meta.dirname, "../../prisma/migrations");
    const directorios = readdirSync(migraciones, { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => entrada.name)
      .sort();

    for (const nombre of directorios) {
      const sql = readFileSync(path.join(migraciones, nombre, "migration.sql"), "utf8");
      const id = randomUUID();
      const checksum = createHash("sha256").update(sql).digest("hex");
      await c.query(
        `INSERT INTO public."_prisma_migrations" ("id", "checksum", "migration_name") VALUES ($1, $2, $3)`,
        [id, checksum, nombre],
      );
      await c.query(sql);
      await c.query(
        `UPDATE public."_prisma_migrations" SET "finished_at" = now(), "applied_steps_count" = 1 WHERE "id" = $1`,
        [id],
      );
    }
  } finally {
    await c.query("select pg_advisory_unlock(hashtext('contable_demo_reset'))");
  }
}
