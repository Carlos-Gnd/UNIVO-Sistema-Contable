# Guía de despliegue

El sistema se publica en tres servicios gratuitos. Los tres toman el código de la rama `main`.

| Parte         | Servicio | URL                                                 | Configuración                  |
| ------------- | -------- | --------------------------------------------------- | ------------------------------ |
| Web           | Vercel   | https://univo-sistema-contable.vercel.app           | Panel de Vercel (ver abajo)    |
| API           | Render   | https://univo-sistema-contable-api.onrender.com     | [`render.yaml`](../../render.yaml) |
| Base de datos | Supabase | proyecto `UNIVO-Sistema-Contable`                   | `packages/db` (migraciones)    |

## Web en Vercel

Proyecto importado desde GitHub con esta configuración:

| Campo                 | Valor                            |
| --------------------- | -------------------------------- |
| Root Directory        | `apps/web`                       |
| Framework Preset      | Vite                             |
| Install Command       | `pnpm install --frozen-lockfile` |
| Build Command         | `pnpm run build`                 |
| Output Directory      | `dist`                           |
| Variable de entorno   | `ENABLE_EXPERIMENTAL_COREPACK=1` |

- La variable `ENABLE_EXPERIMENTAL_COREPACK` hace que Vercel use la versión de pnpm fijada en `packageManager` del `package.json` raíz (`pnpm@12.16.1`).
- Cada push a `main` publica en producción. Cada PR recibe una vista previa con su propia URL, que Vercel deja como comentario en el PR: úsala para revisar la interfaz sin instalar nada.
- El pie de la página muestra la versión del paquete y el commit corto (`VERCEL_GIT_COMMIT_SHA`), así se sabe qué versión está publicada.

## API en Render

El servicio se creó como **Blueprint** a partir de [`render.yaml`](../../render.yaml): plan gratuito, Node 24 y despliegue automático cuando el CI de `main` pasa (`autoDeployTrigger: checksPass`).

- Verificación: `GET /health` responde `{"status":"ok"}`. Render lo usa como _health check_ antes de dar por buena una versión.
- En el plan gratuito el servicio se duerme tras 15 minutos sin peticiones y la primera tarda cerca de un minuto. **Antes de una demostración, abrir `/health` unos minutos antes.**
- Las variables secretas (por ejemplo `DATABASE_URL` cuando la API use la base de datos) se agregan en el panel de Render, nunca en `render.yaml` ni en el repositorio.

## Pendiente cuando la web consuma la API

- **CORS:** la API debe aceptar el dominio de Vercel, con `app.enableCors({ origin: process.env.WEB_URL })` en `apps/api/src/main.ts` y `WEB_URL` definida en Render.
- **Rutas de la web:** al agregar el router, `apps/web` necesita un `vercel.json` que reescriba toda ruta a `index.html`; si no, recargar una página como `/partidas` responde 404.
- **URL de la API en la web:** variable `VITE_API_URL` en Vercel con la URL de Render.

## Verificación rápida

```bash
curl https://univo-sistema-contable-api.onrender.com/health   # {"status":"ok"}
curl -I https://univo-sistema-contable.vercel.app             # HTTP 200
```
