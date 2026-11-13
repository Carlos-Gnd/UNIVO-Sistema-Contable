import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Reflector } from "@nestjs/core";
import { crearPrisma } from "@contable/db";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers.js";
import { EmpresaActivaGuard } from "../src/compartido/empresa-activa.guard.js";

const EMPRESA_ACTIVA = "a1111111-1111-4111-8111-111111111111";
const EMPRESA_INACTIVA = "a2222222-2222-4222-8222-222222222222";
const USUARIO_ACTIVO = "b1111111-1111-4111-8111-111111111111";
const USUARIO_INACTIVO = "b2222222-2222-4222-8222-222222222222";

describe("EmpresaActivaGuard con PostgreSQL", () => {
  let prisma: ReturnType<typeof crearPrisma>;
  let guard: EmpresaActivaGuard;

  beforeAll(async () => {
    const databaseUrl = await basePropia("contable_api_empresa_activa");
    const pg = await reiniciarBase(databaseUrl);
    try {
      await pg.query(`
        INSERT INTO empresas (id, nombre, nit, tipo_contribuyente, activa)
        VALUES
          ('${EMPRESA_ACTIVA}', 'Empresa activa', '0101-010101-101-1', 'persona_natural', true),
          ('${EMPRESA_INACTIVA}', 'Empresa inactiva', '0102-010101-102-2', 'persona_natural', false);
        INSERT INTO usuarios (id, nombre, correo, activo)
        VALUES
          ('${USUARIO_ACTIVO}', 'Usuario activo', 'activo@example.test', true),
          ('${USUARIO_INACTIVO}', 'Usuario inactivo', 'inactivo@example.test', false);
        INSERT INTO membresias (usuario_id, empresa_id, rol_id, todas_sucursales, activa)
        VALUES
          ('${USUARIO_ACTIVO}', '${EMPRESA_ACTIVA}', 1, true, true),
          ('${USUARIO_INACTIVO}', '${EMPRESA_ACTIVA}', 1, true, true),
          ('${USUARIO_ACTIVO}', '${EMPRESA_INACTIVA}', 1, true, true);
      `);
    } finally {
      await pg.end();
    }

    prisma = crearPrisma(databaseUrl);
    guard = new EmpresaActivaGuard(new Reflector(), { prisma } as never);
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function contexto(empresaId: string, usuarioId: string) {
    const solicitud: Record<string, unknown> = {
      params: { empresaId },
      user: { id: usuarioId },
    };
    const executionContext = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => solicitud }),
    };
    return { solicitud, executionContext: executionContext as never };
  }

  it("permite la empresa activa con membresía y usuario activos", async () => {
    const { solicitud, executionContext } = contexto(EMPRESA_ACTIVA, USUARIO_ACTIVO);

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(solicitud).toHaveProperty("empresaActiva", { id: EMPRESA_ACTIVA });
  });

  it("deniega una empresa inactiva", async () => {
    const { executionContext } = contexto(EMPRESA_INACTIVA, USUARIO_ACTIVO);

    await expect(guard.canActivate(executionContext)).rejects.toMatchObject({ status: 404 });
  });

  it("deniega un usuario inactivo aunque conserve una membresía activa", async () => {
    const { executionContext } = contexto(EMPRESA_ACTIVA, USUARIO_INACTIVO);

    await expect(guard.canActivate(executionContext)).rejects.toMatchObject({ status: 404 });
  });
});
