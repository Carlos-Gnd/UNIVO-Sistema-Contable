// Configuración de la CLI de Prisma 7. Las migraciones usan DIRECT_URL (pooler en modo sesión);
// la aplicación usa DATABASE_URL (modo transacción) a través del adaptador de pg.
import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] ?? "" },
});
