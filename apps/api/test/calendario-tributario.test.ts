// Calendario tributario (HU-52, S3-T57): los vencimientos de F-07, F-14 y planillas caen en el día hábil que
// corresponde, el estado cambia con la fecha y el tablero recibe la alerta de los próximos cinco días.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AlertasTributarias, CalendarioTributario, Vencimiento } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222"; // sin permisos de declaraciones
const CONSULTA = "44444444-4444-4444-8444-444444444444"; // declaraciones.ver, sin generar
const AJENO = "33333333-3333-4333-8333-333333333333";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;

async function llamar<T>(
  metodo: "GET" | "POST" | "DELETE",
  ruta: string,
  cuerpo?: unknown,
  usuario = CONTADOR,
) {
  const r = await fetch(`${url}/empresas/${esc.empresaId}/calendario-tributario${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${usuario}`, "content-type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}

const calendario = (desde: string, hasta: string, hoy?: string, usuario?: string) =>
  llamar<CalendarioTributario>(
    "GET",
    `?desde=${desde}&hasta=${hasta}${hoy ? `&hoy=${hoy}` : ""}`,
    undefined,
    usuario,
  );

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_calendario");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");
  for (const [id, nombre] of [
    [CONTADOR, "Contador"],
    [AUXILIAR, "Auxiliar"],
    [CONSULTA, "Consulta"],
    [AJENO, "Ajeno"],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${nombre.toLowerCase()}@prueba.sv`,
    ]);
  }
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, esc.empresaId],
  );
  for (const [usuario, rol] of [
    [AUXILIAR, 3],
    [CONSULTA, 4],
  ] as const) {
    const m = await c.query<{ id: string }>(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, false) returning id",
      [usuario, esc.empresaId, rol],
    );
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
      m.rows[0]!.id,
      esc.sucursalId,
    ]);
  }

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

describe("vencimientos de noviembre y diciembre de 2026 (S3-T55)", () => {
  it("el F-07, el F-14 y la planilla de octubre vencen el décimo día hábil de noviembre: lunes 16 (el 2 es asueto)", async () => {
    const r = await calendario("2026-11-01", "2026-11-30", "2026-11-24");
    expect(r.status).toBe(200);
    expect(r.cuerpo.vencimientos.map((v) => [v.obligacion, v.periodo, v.fecha, v.titulo])).toEqual([
      ["f07", "2026-10", "2026-11-16", "F-07 IVA · octubre"],
      ["f14", "2026-10", "2026-11-16", "F-14 Pago a cuenta · octubre"],
      ["planilla", "2026-10", "2026-11-16", "Planilla ISSS y AFP · octubre"],
    ]);
  });

  it("diciembre: vencen el lunes 14 y enero de 2027 el viernes 15, sin caer en asueto ni fin de semana", async () => {
    const r = await calendario("2026-12-01", "2027-01-31", "2026-12-01");
    expect(r.cuerpo.vencimientos.map((v) => v.fecha)).toEqual([
      "2026-12-14",
      "2026-12-14",
      "2026-12-14",
      "2027-01-15",
      "2027-01-15",
      "2027-01-15",
    ]);
  });

  it("un rango que corta el mes solo trae lo que vence dentro", async () => {
    const r = await calendario("2026-11-17", "2026-12-13", "2026-11-24");
    expect(r.cuerpo.vencimientos).toEqual([]);
  });

  it("el estado depende de hoy: pendiente, próxima (5 días o menos), vencida", async () => {
    const estado = async (hoy: string) =>
      (await calendario("2026-12-14", "2026-12-14", hoy)).cuerpo.vencimientos[0]?.estado;
    expect(await estado("2026-12-07")).toBe("pendiente"); // faltan 7
    expect(await estado("2026-12-09")).toBe("proxima"); // faltan 5
    expect(await estado("2026-12-14")).toBe("proxima"); // vence hoy
    expect(await estado("2026-12-15")).toBe("vencida");
    const r = await calendario("2026-12-14", "2026-12-14", "2026-12-09");
    expect(r.cuerpo.vencimientos[0]?.diasRestantes).toBe(5);
  });

  it("valida el rango: fechas inválidas, invertido o de más de dos años (400)", async () => {
    expect((await llamar("GET", "?desde=2026-11-31&hasta=2026-12-01")).status).toBe(400);
    expect((await calendario("2026-12-01", "2026-11-01")).status).toBe(400);
    expect((await calendario("2026-01-01", "2028-12-31")).status).toBe(400);
    expect((await llamar("GET", "")).status).toBe(400);
  });
});

describe("marcar como presentada", () => {
  it("la constancia deja el vencimiento presentado, con su nota, y la bitácora registra quién", async () => {
    const r = await llamar<Vencimiento>("POST", "/f07/2026-10/presentada", { nota: "Acuse 123456" });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      obligacion: "f07",
      periodo: "2026-10",
      estado: "presentada",
      nota: "Acuse 123456",
    });
    const lista = (await calendario("2026-11-01", "2026-11-30", "2026-11-12")).cuerpo.vencimientos;
    expect(lista.find((v) => v.obligacion === "f07")).toMatchObject({
      estado: "presentada",
      nota: "Acuse 123456",
    });
    expect(lista.find((v) => v.obligacion === "f14")?.estado).toBe("proxima");
    const b = await c.query(
      `select usuario_id from bitacora where tabla = 'presentaciones_tributarias' and accion = 'INSERT'`,
    );
    expect(b.rows[0]?.usuario_id).toBe(CONTADOR);
  });

  it("marcar dos veces no duplica; quitar la marca lo devuelve a pendiente", async () => {
    await llamar("POST", "/f07/2026-10/presentada", {});
    const n = await c.query<{ n: string }>("select count(*)::text as n from presentaciones_tributarias");
    expect(n.rows[0]?.n).toBe("1");
    const r = await llamar<Vencimiento>("DELETE", "/f07/2026-10/presentada");
    expect(r.status).toBe(200);
    expect(r.cuerpo.estado).not.toBe("presentada");
  });

  it("valida la obligación y el período (400)", async () => {
    expect((await llamar("POST", "/iva/2026-10/presentada", {})).status).toBe(400);
    expect((await llamar("POST", "/f07/2026-13/presentada", {})).status).toBe(400);
  });
});

describe("alertas del tablero y permisos", () => {
  beforeAll(async () => {
    await llamar("POST", "/f14/2026-10/presentada", {});
    // Lo anterior a octubre ya se presentó: solo cuentan los vencimientos de noviembre
    for (const periodo of ["2026-07", "2026-08", "2026-09"]) {
      for (const o of ["f07", "f14", "planilla"]) await llamar("POST", `/${o}/${periodo}/presentada`, {});
    }
  });

  it("el 12 de noviembre avisa lo que vence en cinco días o menos y no lo presentado", async () => {
    const r = await llamar<AlertasTributarias>("GET", "/alertas?hoy=2026-11-12");
    expect(r.status).toBe(200);
    expect(r.cuerpo.diasDeAlerta).toBe(5);
    // el F-14 de octubre ya está presentado: quedan el F-07 y la planilla
    expect(r.cuerpo.alertas.map((v) => [v.obligacion, v.estado, v.diasRestantes])).toEqual([
      ["f07", "proxima", 4],
      ["planilla", "proxima", 4],
    ]);
  });

  it("sin nada próximo no hay alertas, y lo vencido sin presentar sigue avisando", async () => {
    expect((await llamar<AlertasTributarias>("GET", "/alertas?hoy=2026-11-02")).cuerpo.alertas).toEqual([]);
    const vencidas = (await llamar<AlertasTributarias>("GET", "/alertas?hoy=2026-11-18")).cuerpo.alertas;
    expect(vencidas.map((v) => [v.obligacion, v.estado])).toEqual([
      ["f07", "vencida"],
      ["planilla", "vencida"],
    ]);
  });

  it("quien solo consulta ve el calendario pero no marca (403); el auxiliar no lo ve (403); un ajeno, 404", async () => {
    expect((await calendario("2026-11-01", "2026-11-30", undefined, CONSULTA)).status).toBe(200);
    expect((await llamar("POST", "/f07/2026-10/presentada", {}, CONSULTA)).status).toBe(403);
    expect((await calendario("2026-11-01", "2026-11-30", undefined, AUXILIAR)).status).toBe(403);
    expect((await calendario("2026-11-01", "2026-11-30", undefined, AJENO)).status).toBe(404);
  });
});
