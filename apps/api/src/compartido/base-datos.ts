import { Global, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { crearPrisma, type PrismaClient } from "@contable/db";

/**
 * Cliente de Prisma compartido por toda la API. Se crea en la primera consulta, así la API arranca
 * (y responde /health) aunque DATABASE_URL todavía no esté configurada.
 */
@Injectable()
export class BaseDatos implements OnModuleDestroy {
  private cliente: PrismaClient | undefined;

  get prisma(): PrismaClient {
    this.cliente ??= crearPrisma();
    return this.cliente;
  }

  async onModuleDestroy(): Promise<void> {
    await this.cliente?.$disconnect();
  }
}

@Global()
@Module({ providers: [BaseDatos], exports: [BaseDatos] })
export class BaseDatosModule {}
