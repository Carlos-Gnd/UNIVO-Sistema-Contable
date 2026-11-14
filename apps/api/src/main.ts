import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configurarCors } from "./compartido/cors.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarCors(app);
  const port = process.env.PORT ?? 3000;

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
