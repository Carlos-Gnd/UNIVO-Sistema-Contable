import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoUsuario, crearPrisma, type PrismaClient } from "../src/index";
import { crearEscenario, reiniciarBase, URL_PRUEBAS, type Escenario } from "./helpers";

let c: pg.Client;
let prisma: PrismaClient;
let esc: Escenario;
const USUARIO = "33333333-3333-4333-8333-333333333333";

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-040404-104-4");
  prisma = crearPrisma(URL_PRUEBAS);
});
afterAll(async () => {
  await prisma?.$disconnect();
  await c?.end();
});

describe("cliente de Prisma con las reglas de la base", () => {
  it("crea y contabiliza una partida con sus líneas en una transacción, registrando al usuario", async () => {
    const partida = await comoUsuario(prisma, USUARIO, async (tx) => {
      const p = await tx.partida.create({
        data: {
          empresaId: esc.empresaId,
          sucursalId: esc.sucursalId,
          fecha: new Date("2026-10-05"),
          concepto: "Venta al contado",
          estado: "contabilizada",
          detalles: {
            create: [
              { cuentaId: esc.cuentas["110101"]!, debe: "1130.00", haber: "0", empresaId: esc.empresaId },
              { cuentaId: esc.cuentas["5101"]!, debe: "0", haber: "1130.00", empresaId: esc.empresaId },
            ],
          },
        },
      });
      // El trigger asigna número y usuario: hay que releerla
      return tx.partida.findUniqueOrThrow({ where: { id: p.id }, include: { detalles: true } });
    });

    expect(partida.numero).toBe(1);
    expect(partida.creadoPor).toBe(USUARIO);
    expect(partida.contabilizadoPor).toBe(USUARIO);
    expect(partida.detalles.map((d) => d.debe.toFixed(2)).sort()).toEqual(["0.00", "1130.00"]);

    const b = await prisma.bitacora.findFirst({ where: { tabla: "partidas", registroId: partida.id } });
    expect(b?.usuarioId).toBe(USUARIO);
  });

  it("revierte toda la transacción si la partida contabilizada no cuadra", async () => {
    await expect(
      comoUsuario(prisma, USUARIO, (tx) =>
        tx.partida.create({
          data: {
            empresaId: esc.empresaId,
            sucursalId: esc.sucursalId,
            fecha: new Date("2026-10-06"),
            estado: "contabilizada",
            detalles: {
              create: [
                { cuentaId: esc.cuentas["110101"]!, debe: "100", haber: "0", empresaId: esc.empresaId },
                { cuentaId: esc.cuentas["5101"]!, debe: "0", haber: "99.99", empresaId: esc.empresaId },
              ],
            },
          },
        }),
      ),
    ).rejects.toThrow(/no cuadra/i);
    expect(await prisma.partida.count({ where: { fecha: new Date("2026-10-06") } })).toBe(0);
    // el correlativo no se consumió
    expect((await prisma.correlativo.findFirstOrThrow({ where: { empresaId: esc.empresaId } })).ultimo).toBe(
      1,
    );
  });
});
