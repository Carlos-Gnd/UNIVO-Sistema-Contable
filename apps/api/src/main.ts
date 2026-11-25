import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configurarCors } from "./compartido/cors.js";
import { configurarSeguridad } from "./compartido/seguridad.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarSeguridad(app);
  configurarCors(app);
  const port = process.env.PORT ?? 3000;

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
