import type { INestApplication } from "@nestjs/common";
import helmet from "helmet";

/**
 * Cabeceras de seguridad y proxy de confianza. La API vive detrás del proxy de Render: con "trust proxy"
 * request.ip es la del cliente y no la del proxy.
 */
export function configurarSeguridad(app: INestApplication): void {
  (app.getHttpAdapter().getInstance() as { set(clave: string, valor: unknown): unknown }).set(
    "trust proxy",
    1,
  );
  app.use(helmet());
}
