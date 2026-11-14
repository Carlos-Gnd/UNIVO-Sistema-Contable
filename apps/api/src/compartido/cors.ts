import type { INestApplication } from "@nestjs/common";

/** Puerto del servidor de desarrollo de Vite (apps/web). */
const WEB_LOCAL = "http://localhost:5173";

const sinBarraFinal = (url: string) => url.trim().replace(/\/+$/, "");

/**
 * Orígenes del navegador que pueden llamar a la API: la web publicada (WEB_URL) y, separados por comas,
 * los de CORS_ORIGENES (por ejemplo, una vista previa de Vercel). Fuera de producción también la web local.
 * CORS no reemplaza la autenticación: cada ruta sigue exigiendo el token de Supabase.
 */
export function origenesPermitidos(env: NodeJS.ProcessEnv = process.env): string[] {
  const origenes = [env["WEB_URL"] ?? "", ...(env["CORS_ORIGENES"] ?? "").split(",")]
    .map(sinBarraFinal)
    .filter(Boolean);
  if (env["NODE_ENV"] !== "production") origenes.push(WEB_LOCAL);
  return [...new Set(origenes)];
}

/** Habilita CORS para la web; se llama al arrancar la API (main.ts) y en las pruebas. */
export function configurarCors(app: INestApplication, env: NodeJS.ProcessEnv = process.env): void {
  app.enableCors({
    origin: origenesPermitidos(env),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
    // El navegador guarda la respuesta del preflight 10 minutos
    maxAge: 600,
  });
}
