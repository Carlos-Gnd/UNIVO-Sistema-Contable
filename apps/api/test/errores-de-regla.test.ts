// El adaptador de Prisma reconoce los rechazos de los triggers contables por su código de PostgreSQL.
import { crearPrisma } from "@contable/db";
import { afterAll, expect, it } from "vitest";
import { basePropia } from "../../../packages/db/test/helpers";
import { mensajeDeRegla } from "../src/modules/contabilidad/infrastructure/repositorio-contabilizacion.prisma.js";

const prisma = crearPrisma(await basePropia("contable_api"));
afterAll(() => prisma.$disconnect());

const errorDe = async (sql: string) => {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (e) {
    return e;
  }
  throw new Error("La consulta debía fallar");
};

it("extrae el mensaje de RAISE EXCEPTION y del cuadre (check_violation)", async () => {
  const raise = await errorDe(`DO $$ BEGIN RAISE EXCEPTION 'El período de 11/2026 está cerrado'; END $$`);
  expect(mensajeDeRegla(raise)).toBe("El período de 11/2026 está cerrado");

  const cuadre = await errorDe(
    `DO $$ BEGIN RAISE EXCEPTION 'La partida 3 no cuadra' USING ERRCODE = 'check_violation'; END $$`,
  );
  expect(mensajeDeRegla(cuadre)).toBe("La partida 3 no cuadra");
});

it("no confunde otros errores con reglas contables", async () => {
  expect(mensajeDeRegla(await errorDe("SELECT 1/0"))).toBeNull();
  expect(mensajeDeRegla(new Error("red caída"))).toBeNull();
});
