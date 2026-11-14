/** Códigos de PostgreSQL usados por triggers y restricciones para rechazar reglas de negocio. */
const ERRORES_DE_REGLA = new Set(["P0001", "23514", "23503"]);

/** Extrae el mensaje original de una regla de PostgreSQL envuelta por Prisma. */
export function mensajeDeRegla(error: unknown): string | null {
  const siguiente = (e: Record<string, unknown>): unknown =>
    e["cause"] ?? (e["meta"] as { driverAdapterError?: unknown } | undefined)?.driverAdapterError;
  for (let e: unknown = error; e && typeof e === "object"; e = siguiente(e as Record<string, unknown>)) {
    const { code, originalCode, message, originalMessage } = e as Record<string, unknown>;
    const codigo = typeof originalCode === "string" ? originalCode : code;
    if (typeof codigo === "string" && ERRORES_DE_REGLA.has(codigo)) {
      const texto = typeof originalMessage === "string" ? originalMessage : message;
      return typeof texto === "string" ? texto : "La base de datos rechazó la operación.";
    }
  }
  return null;
}
