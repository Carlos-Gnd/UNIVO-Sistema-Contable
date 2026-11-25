import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { SupabaseAuthGuard } from "./auth/supabase-auth.guard.js";
import { SupabaseAuthService } from "./auth/supabase-auth.service.js";
import { BaseDatosModule } from "./compartido/base-datos.js";
import { EmpresaActivaGuard } from "./compartido/empresa-activa.guard.js";
import { PermisoGuard } from "./compartido/permiso.guard.js";
import { ActivoFijoModule } from "./modules/activo-fijo/activo-fijo.module.js";
import { AuditoriaModule } from "./modules/auditoria/auditoria.module.js";
import { ContabilidadModule } from "./modules/contabilidad/contabilidad.module.js";
import { CierreAnualModule } from "./modules/cierre-anual/cierre-anual.module.js";
import { ImportacionModule } from "./modules/importacion/importacion.module.js";
import { InventarioModule } from "./modules/inventario/inventario.module.js";
import { OrganizacionModule } from "./modules/organizacion/organizacion.module.js";
import { TributarioModule } from "./modules/tributario/tributario.module.js";
import { PlanillaModule } from "./modules/planilla/planilla.module.js";
import { RecurrentesModule } from "./modules/recurrentes/recurrentes.module.js";
import { ReportesModule } from "./modules/reportes/reportes.module.js";
import { RespaldosModule } from "./modules/respaldos/respaldos.module.js";
import { ThrottlerModule } from "@nestjs/throttler";
import { configuracionLimite, LimiteUsuarioGuard } from "./compartido/limite-peticiones.js";
import { TesoreriaModule } from "./modules/tesoreria/tesoreria.module.js";

@Module({
  imports: [
    ThrottlerModule.forRoot(configuracionLimite()),
    BaseDatosModule,
    ContabilidadModule,
    CierreAnualModule,
    OrganizacionModule,
    AuditoriaModule,
    ImportacionModule,
    ReportesModule,
    ActivoFijoModule,
    TributarioModule,
    TesoreriaModule,
    InventarioModule,
    PlanillaModule,
    RecurrentesModule,
    RespaldosModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SupabaseAuthService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: LimiteUsuarioGuard },
    { provide: APP_GUARD, useClass: EmpresaActivaGuard },
    { provide: APP_GUARD, useClass: PermisoGuard },
  ],
})
export class AppModule {}
