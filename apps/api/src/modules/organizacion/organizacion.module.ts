import { Module } from "@nestjs/common";
import { LogoController } from "./logo.controller.js";
import { LogoService } from "./logo.service.js";
import { InvitacionController } from "./invitacion.controller.js";
import { InvitacionService } from "./invitacion.service.js";

@Module({
  controllers: [LogoController, InvitacionController],
  providers: [LogoService, InvitacionService],
})
export class OrganizacionModule {}
