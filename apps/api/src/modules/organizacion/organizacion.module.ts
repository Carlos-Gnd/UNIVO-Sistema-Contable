import { Module } from "@nestjs/common";
import { LogoController } from "./logo.controller.js";
import { LogoService } from "./logo.service.js";

@Module({
  controllers: [LogoController],
  providers: [LogoService],
})
export class OrganizacionModule {}
