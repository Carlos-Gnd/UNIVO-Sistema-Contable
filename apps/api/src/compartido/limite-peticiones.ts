import { Injectable } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerModuleOptions } from "@nestjs/throttler";

/** Peticiones por minuto y por usuario en cualquier ruta; las rutas pesadas fijan un tope menor con @Throttle. */
export const LIMITE_GENERAL_POR_MINUTO = 120;

/** Tope de las operaciones costosas (respaldos, restauración, planilla). */
export const LIMITE_PESADO = { default: { limit: 5, ttl: 60_000 } } as const;
export const LIMITE_MUY_PESADO = { default: { limit: 2, ttl: 60_000 } } as const;

/** Las pruebas de la API hacen cientos de peticiones: solo se limitan si lo piden con LIMITE_EN_PRUEBAS. */
const omitirEnPruebas = () => process.env["VITEST"] === "true" && process.env["LIMITE_EN_PRUEBAS"] !== "true";

export function configuracionLimite(): ThrottlerModuleOptions {
  const limite = Number(process.env["LIMITE_PETICIONES_POR_MINUTO"]) || LIMITE_GENERAL_POR_MINUTO;
  return { throttlers: [{ ttl: 60_000, limit: limite }], skipIf: omitirEnPruebas };
}

/**
 * Cuenta las peticiones por usuario autenticado, no por IP: tras el proxy de Render todos los usuarios
 * compartirían una sola dirección. Va después de SupabaseAuthGuard para que ya exista request.user.
 */
@Injectable()
export class LimiteUsuarioGuard extends ThrottlerGuard {
  protected override getTracker(solicitud: Record<string, unknown>): Promise<string> {
    const usuario = solicitud["user"] as { id?: string } | undefined;
    return Promise.resolve(usuario?.id ?? String(solicitud["ip"] ?? "anonimo"));
  }
}
