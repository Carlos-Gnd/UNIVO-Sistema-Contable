import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { BaseDatosModule } from "./compartido/base-datos.js";
import { ContabilidadModule } from "./modules/contabilidad/contabilidad.module.js";

@Module({
  imports: [BaseDatosModule, ContabilidadModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
