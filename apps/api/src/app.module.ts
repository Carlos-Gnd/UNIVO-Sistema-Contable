import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { SupabaseAuthGuard } from "./auth/supabase-auth.guard.js";
import { SupabaseAuthService } from "./auth/supabase-auth.service.js";
import { LogoController } from "./empresas/logo.controller.js";
import { LogoService } from "./empresas/logo.service.js";

@Module({
  controllers: [AppController, LogoController],
  providers: [
    AppService,
    SupabaseAuthService,
    LogoService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
  ],
})
export class AppModule {}
