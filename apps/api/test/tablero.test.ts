import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarCasoCherophonex, leerCaso } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const caso = leerCaso();
const efectivoEsperado = Object.entries(caso.esperado.balanzas["posterior-cierre"].cuentas)
  .filter(([codigo]) => codigo.startsWith("1101") || codigo.startsWith("1102"))
  .reduce(
    (total, [, cuenta]) => total.mas(Dinero.de(cuenta.saldoDeudor).menos(cuenta.saldoAcreedor)),
    Dinero.cero(),
  )
  .aTexto();

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let empresaId: string;

async function pedir(query: string, usuarioId = CONTADOR) {
  const respuesta = await fetch(`${url}/empresas/${empresaId}/tablero${query}`, {
    headers: { authorization: `Bearer ${usuarioId}` },
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_tablero");
  c = await reiniciarBase(urlBase);
  const carga = await cargarCasoCherophonex(c);
  empresaId = carga.empresaId;
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@tablero.test')",
    [CONTADOR],
  );
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, empresaId],
  );

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("consulta de indicadores del tablero (S4-T19)", () => {
  it("requiere sesión y valida el período mensual", async () => {
    const sinSesion = await fetch(`${url}/empresas/${empresaId}/tablero?mes=2026-10`);
    expect(sinSesion.status).toBe(401);
    expect((await pedir("?mes=2026-13")).status).toBe(400);
    expect((await pedir("?mes=2025-10")).status).toBe(404);
    expect((await pedir("?mes=2026-10&sucursalId=44444444-4444-4444-8444-444444444444")).status).toBe(403);
  });

  it("coincide con las cifras del estado de resultados y limita los datos al período", async () => {
    const respuesta = await pedir("?mes=2026-10");
    expect(respuesta.status, JSON.stringify(respuesta.cuerpo)).toBe(200);
    expect(respuesta.cuerpo).toMatchObject({
      ventasNetas: "46051.20",
      utilidadBruta: "11939.20",
      utilidadEjercicio: "7594.99",
      efectivo: efectivoEsperado,
      margenBruto: "25.93",
      margenNeto: "16.49",
      ventasSemanales: [
        { etiqueta: "1", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "2", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "3", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "4", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "5", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
      ],
    });
  });
});
