import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { HojaTrabajo } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  basePropia,
  contabilizar,
  crearEscenario,
  crearPartida,
  reiniciarBase,
} from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const SIN_PERMISO = "22222222-2222-4222-8222-222222222222";

const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let empresaId: string;
let cuentas: Record<string, string>;

async function consultar(usuario: string | null = CONTADOR) {
  const respuesta = await fetch(
    `${url}/empresas/${empresaId}/hoja-trabajo?desde=2026-02-01&hasta=2026-02-28`,
    { headers: usuario ? { authorization: `Bearer ${usuario}` } : {} },
  );
  return {
    status: respuesta.status,
    cuerpo: (await respuesta.json()) as HojaTrabajo & Record<string, unknown>,
  };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_hoja_trabajo");
  c = await reiniciarBase(urlBase);
  const escenario = await crearEscenario(c, "0614-010190-101-5");
  empresaId = escenario.empresaId;
  cuentas = escenario.cuentas;
  await c.query("insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@hoja.test')", [
    CONTADOR,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, empresaId],
  );
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Sin permiso', 'sin-permiso@hoja.test')",
    [SIN_PERMISO],
  );
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 4, false)",
    [SIN_PERMISO, empresaId],
  );
  await c.query(
    `delete from rol_permisos where rol_id = 4 and permiso_id = (select id from permisos where modulo = 'estados' and accion = 'ver')`,
  );
  const ajuste = await crearPartida(
    c,
    escenario,
    "2026-01-15",
    [
      [cuentas["110101"]!, "50.00", "0"],
      [cuentas["5101"]!, "0", "50.00"],
    ],
    "ajuste",
  );
  await contabilizar(c, ajuste);
  const id = await crearPartida(c, escenario, "2026-02-01", [
    [cuentas["110101"]!, "600.00", "0"],
    [cuentas["5101"]!, "0", "600.00"],
  ]);
  await contabilizar(c, id);

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue(authPrueba)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("GET /empresas/:empresaId/hoja-trabajo (S2-T33)", () => {
  it("devuelve las diez columnas y cuadra una utilidad entre resultados y balance", async () => {
    const respuesta = await consultar();
    expect(respuesta.status).toBe(200);
    expect(respuesta.cuerpo.resultado).toEqual({ tipo: "utilidad", monto: "650.00" });
    expect(respuesta.cuerpo.totales).toMatchObject({
      balanzaDebe: "600.00",
      balanzaHaber: "600.00",
      ajustesDebe: "50.00",
      ajustesHaber: "50.00",
      balanzaAjustadaDebe: "650.00",
      balanzaAjustadaHaber: "650.00",
      estadoResultadosDebe: "650.00",
      estadoResultadosHaber: "650.00",
      balanceGeneralDebe: "650.00",
      balanceGeneralHaber: "650.00",
    });
    expect(respuesta.cuerpo.cuadra).toBe(true);
    expect((await consultar(null)).status).toBe(401);
    expect((await consultar(SIN_PERMISO)).status).toBe(403);
  });
});
