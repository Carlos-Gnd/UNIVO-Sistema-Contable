// Prueba E2E (S1-T88, HU-20 a HU-22): el recorrido completo de una partida por HTTP contra PostgreSQL real, con
// los mismos endpoints que usa la web: registrar un borrador descuadrado, verlo en la bandeja de pendientes,
// corregirlo, comprobar que el auxiliar no puede contabilizar, contabilizarlo como contador y encontrarlo en el
// libro diario con su número correlativo.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LibroDiario, PartidaVista } from "@contable/shared";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

/** Supabase simulado: "Bearer <id del usuario>" es un token válido de ese usuario. */
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;

async function pedir<T = Record<string, unknown>>(
  metodo: "GET" | "POST" | "PUT",
  ruta: string,
  usuario: string,
  cuerpo?: unknown,
) {
  const r = await fetch(`${url}/empresas/${esc.empresaId}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${usuario}`, "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}

/** Venta al contado: Caja al debe y Ventas al haber. */
const venta = (debe: string, haber: string) => ({
  sucursalId: esc.sucursalId,
  fecha: "2026-11-12",
  tipo: "operacion",
  concepto: "Venta al contado según factura 0001",
  lineas: [
    { cuentaId: esc.cuentas["110101"], debe, haber: "0" },
    { cuentaId: esc.cuentas["5101"], debe: "0", haber },
  ],
});

const libroNoviembre = () =>
  pedir<LibroDiario>("GET", "/libro-diario?desde=2026-11-01&hasta=2026-11-30", CONTADOR);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_e2e_partida");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");

  for (const [id, rol, todas] of [
    [CONTADOR, 2, true],
    [AUXILIAR, 3, false],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      `Usuario ${rol}`,
      `${id}@prueba.sv`,
    ]);
    const m = await c.query<{ id: string }>(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
      [id, esc.empresaId, rol, todas],
    );
    if (!todas) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        m.rows[0]!.id,
        esc.sucursalId,
      ]);
    }
  }

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

// Los pasos dependen uno del otro: Vitest ejecuta en orden las pruebas de un archivo, como las haría el usuario
describe("E2E: registrar y contabilizar una partida", () => {
  let partidaId = "";

  it("1. el auxiliar guarda la partida aunque no cuadre: queda en borrador y sin número", async () => {
    const r = await pedir<PartidaVista>("POST", "/partidas", AUXILIAR, venta("113.00", "100.00"));
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      estado: "borrador",
      numero: null,
      totalDebe: "113.00",
      totalHaber: "100.00",
      diferencia: "13.00",
      cuadra: false,
    });
    partidaId = r.cuerpo.id;
  });

  it("2. aparece en la bandeja de pendientes con su diferencia", async () => {
    const r = await pedir<PartidaVista[]>("GET", "/partidas/borradores", AUXILIAR);
    expect(r.status).toBe(200);
    expect(r.cuerpo.find((p) => p.id === partidaId)).toMatchObject({ diferencia: "13.00", cuadra: false });
  });

  it("3. el contador no puede contabilizarla mientras no cuadre, y no se consume número", async () => {
    const r = await pedir("POST", `/partidas/${partidaId}/contabilizar`, CONTADOR);
    expect(r.status).toBe(422);
    expect(r.cuerpo).toMatchObject({ motivo: "no_cuadra" });
  });

  it("4. el borrador no afecta el libro diario", async () => {
    const r = await libroNoviembre();
    expect(r.status).toBe(200);
    expect(r.cuerpo.partidas).toBe(0);
  });

  it("5. el auxiliar corrige el borrador y ahora cuadra", async () => {
    const r = await pedir<PartidaVista>("PUT", `/partidas/${partidaId}`, AUXILIAR, venta("113.00", "113.00"));
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ estado: "borrador", diferencia: "0.00", cuadra: true });
  });

  it("6. el auxiliar no puede contabilizar", async () => {
    const r = await pedir("POST", `/partidas/${partidaId}/contabilizar`, AUXILIAR);
    expect(r.status).toBe(403);
    const fila = await c.query("select estado, numero from partidas where id = $1", [partidaId]);
    expect(fila.rows[0]).toEqual({ estado: "borrador", numero: null });
  });

  it("7. el contador la contabiliza desde la bandeja y recibe el número 1", async () => {
    const r = await pedir("POST", "/partidas/contabilizar", CONTADOR, { ids: [partidaId] });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({
      contabilizadas: [{ id: partidaId, numero: 1, ambito: "2026" }],
      rechazadas: [],
    });
  });

  it("8. la partida queda contabilizada y sale de la bandeja", async () => {
    const partida = await pedir<PartidaVista>("GET", `/partidas/${partidaId}`, AUXILIAR);
    expect(partida.cuerpo).toMatchObject({ estado: "contabilizada", numero: 1 });

    const bandeja = await pedir<PartidaVista[]>("GET", "/partidas/borradores", CONTADOR);
    expect(bandeja.cuerpo.some((p) => p.id === partidaId)).toBe(false);
  });

  it("9. aparece en el libro diario con su número y el libro cuadra", async () => {
    const r = await libroNoviembre();
    expect(r.cuerpo).toMatchObject({
      partidas: 1,
      totales: { debe: "113.00", haber: "113.00" },
      cuadra: true,
    });
    const encabezado = r.cuerpo.paginas
      .flatMap((p) => p.renglones)
      .find((renglon) => renglon.tipo === "partida" && renglon.partidaId === partidaId);
    expect(encabezado).toMatchObject({ fecha: "2026-11-12" });
  });

  it("10. no se puede contabilizar dos veces ni editar como borrador", async () => {
    expect((await pedir("POST", `/partidas/${partidaId}/contabilizar`, CONTADOR)).status).toBe(422);
    expect((await pedir("PUT", `/partidas/${partidaId}`, AUXILIAR, venta("1.00", "1.00"))).status).toBe(409);
    const fila = await c.query("select numero from partidas where id = $1", [partidaId]);
    expect(fila.rows[0]).toEqual({ numero: 1 });
  });
});
