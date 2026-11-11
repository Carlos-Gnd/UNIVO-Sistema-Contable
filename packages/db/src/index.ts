// Acceso a la base de datos del sistema contable (Prisma 7 + adaptador de node-postgres).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "./generated/prisma/client";

export { PrismaClient, Prisma };
export * from "./generated/prisma/enums";

/**
 * Crea el cliente de Prisma. En la API usar DATABASE_URL (pooler de Supabase en modo transacción).
 */
export function crearPrisma(connectionString = process.env["DATABASE_URL"]): PrismaClient {
  if (!connectionString) throw new Error("Falta DATABASE_URL");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Cliente de transacción: el mismo PrismaClient sin los métodos de conexión. */
export type Tx = Prisma.TransactionClient;

/**
 * Ejecuta `fn` en una transacción con el usuario fijado en la sesión de PostgreSQL.
 * Los triggers de bitácora y de partidas leen ese valor (app.usuario_id) para registrar quién hizo cada cambio.
 * Toda escritura de la API debe pasar por aquí.
 */
export async function comoUsuario<T>(
  prisma: PrismaClient,
  usuarioId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.usuario_id', ${usuarioId}, true)`;
    return fn(tx);
  });
}
