import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { SupabaseAuthGuard } from "./auth/supabase-auth.guard.js";
import { SupabaseAuthService } from "./auth/supabase-auth.service.js";
import { BaseDatosModule } from "./compartido/base-datos.js";
import { EmpresaActivaGuard } from "./compartido/empresa-activa.guard.js";
import { AuditoriaModule } from "./modules/auditoria/auditoria.module.js";
import { ContabilidadModule } from "./modules/contabilidad/contabilidad.module.js";
import { ImportacionModule } from "./modules/importacion/importacion.module.js";
import { OrganizacionModule } from "./modules/organizacion/organizacion.module.js";

@Module({
  imports: [BaseDatosModule, ContabilidadModule, OrganizacionModule, AuditoriaModule, ImportacionModule],
  controllers: [AppController],
  providers: [
    AppService,
    SupabaseAuthService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: EmpresaActivaGuard },
  ],
})
export class AppModule {}
