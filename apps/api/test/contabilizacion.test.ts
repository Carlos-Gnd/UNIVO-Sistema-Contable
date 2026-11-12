// Contabilización de partidas (HU-22, S1-T84 y S1-T85) de punta a punta: HTTP → caso de uso → PostgreSQL.
// Usa una base propia (contable_api) en el mismo servidor de pruebas que packages/db.
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  basePropia,
  crearEscenario,
  crearPartida,
  reiniciarBase,
  type Escenario,
} from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import type { SolicitudConUsuario } from "../src/compartido/usuario-actual.js";

type SolicitudPrueba = SolicitudConUsuario & { headers: Record<string, string | string[] | undefined> };

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONTADOR_SUCURSAL = "33333333-3333-4333-8333-333333333333";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;

/** POST a la API como el usuario indicado (el guard JWT de HU-05 se simula con una cabecera). */
async function post(ruta: string, usuario: string | null, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${esc.empresaId}${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(usuario ? { "x-usuario-prueba": usuario } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const cuadrada = (fecha: string, monto = "113.00") =>
  crearPartida(c, esc, fecha, [
    [esc.cuentas["110101"]!, monto, "0"],
    [esc.cuentas["5101"]!, "0", monto],
  ]);

const estado = async (id: string) =>
  (await c.query("select estado, numero from partidas where id = $1", [id])).rows[0] as {
    estado: string;
    numero: number | null;
  };

beforeAll(async () => {
  const urlBase = await basePropia("contable_api");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-1");

  const usuarios: [string, number, boolean][] = [
    [CONTADOR, 2, true],
    [AUXILIAR, 3, true],
    [CONTADOR_SUCURSAL, 2, false], // contador sin acceso a la casa matriz
  ];
  for (const [id, rol, todas] of usuarios) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      `Usuario ${rol}`,
      `${id}@prueba.sv`,
    ]);
    await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
      [id, esc.empresaId, rol, todas],
    );
  }

  process.env["DATABASE_URL"] = urlBase;
  app = await NestFactory.create(AppModule, { logger: false });
  // Simula el guard JWT (HU-05): toma el usuario de una cabecera de prueba
  app.use((req: SolicitudPrueba, _res: unknown, next: () => void) => {
    const id = req.headers["x-usuario-prueba"];
    if (typeof id === "string") req.usuario = { id };
    next();
  });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("POST /empresas/:empresa/partidas/:partida/contabilizar", () => {
  it("exige sesión", async () => {
    const id = await cuadrada("2026-11-02");
    expect((await post(`/partidas/${id}/contabilizar`, null)).status).toBe(401);
  });

  it("asigna el siguiente correlativo y registra quién contabilizó", async () => {
    const id = await cuadrada("2026-11-03");
    const r = await post(`/partidas/${id}/contabilizar`, CONTADOR);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({ id, numero: 1, ambito: "2026" });

    const fila = await c.query("select contabilizado_por, contabilizado_en from partidas where id = $1", [
      id,
    ]);
    expect(fila.rows[0]).toMatchObject({ contabilizado_por: CONTADOR });
    const bitacora = await c.query(
      "select usuario_id from bitacora where tabla = 'partidas' and registro_id = $1 and accion = 'UPDATE'",
      [id],
    );
    expect(bitacora.rows).toEqual([{ usuario_id: CONTADOR }]);
  });

  it("el auxiliar no puede contabilizar", async () => {
    const id = await cuadrada("2026-11-04");
    const r = await post(`/partidas/${id}/contabilizar`, AUXILIAR);
    expect(r.status).toBe(403);
    expect(await estado(id)).toEqual({ estado: "borrador", numero: null });
  });

  it("rechaza una descuadrada sin consumir número", async () => {
    const id = await crearPartida(c, esc, "2026-11-05", [
      [esc.cuentas["110101"]!, "1130.00", "0"],
      [esc.cuentas["5101"]!, "0", "1105.00"],
    ]);
    const r = await post(`/partidas/${id}/contabilizar`, CONTADOR);
    expect(r.status).toBe(422);
    expect(r.cuerpo).toMatchObject({
      motivo: "no_cuadra",
      mensaje: "No cuadra: debe 1130.00, haber 1105.00, diferencia US$ 25.00.",
    });
    expect(await estado(id)).toEqual({ estado: "borrador", numero: null });

    const siguiente = await cuadrada("2026-11-05");
    expect((await post(`/partidas/${siguiente}/contabilizar`, CONTADOR)).cuerpo).toMatchObject({ numero: 2 });
  });

  it("no contabiliza dos veces la misma partida", async () => {
    const id = await cuadrada("2026-11-06");
    expect((await post(`/partidas/${id}/contabilizar`, CONTADOR)).status).toBe(200);
    const r = await post(`/partidas/${id}/contabilizar`, CONTADOR);
    expect(r.status).toBe(422);
    expect(r.cuerpo).toMatchObject({
      motivo: "no_es_borrador",
      mensaje: "La partida ya está contabilizada.",
    });
  });

  it("responde 404 si la partida no existe o es de otra empresa", async () => {
    const otra = await crearEscenario(c, "0614-010190-102-0");
    const ajena = await crearPartida(c, otra, "2026-11-06", [
      [otra.cuentas["110101"]!, "10.00", "0"],
      [otra.cuentas["5101"]!, "0", "10.00"],
    ]);
    expect((await post(`/partidas/${ajena}/contabilizar`, CONTADOR)).status).toBe(404);
    expect((await post(`/partidas/${CONTADOR}/contabilizar`, CONTADOR)).status).toBe(404);
    expect(await estado(ajena)).toEqual({ estado: "borrador", numero: null });
  });

  it("respeta las sucursales asignadas al usuario", async () => {
    const id = await cuadrada("2026-11-07");
    expect((await post(`/partidas/${id}/contabilizar`, CONTADOR_SUCURSAL)).status).toBe(403);
  });

  it("con solicitudes simultáneas no repite ni salta números", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push(await cuadrada("2026-11-08", "50.00"));
    const misma = ids[0]!;
    const respuestas = await Promise.all([
      ...ids.map((id) => post(`/partidas/${id}/contabilizar`, CONTADOR)),
      post(`/partidas/${misma}/contabilizar`, CONTADOR), // la misma partida dos veces a la vez
    ]);
    expect(respuestas.filter((r) => r.status === 200)).toHaveLength(8);
    expect(respuestas.filter((r) => r.status === 422)).toHaveLength(1);

    const numeros = respuestas.flatMap((r) => (r.status === 200 ? [r.cuerpo["numero"] as number] : []));
    const desde = Math.min(...numeros);
    expect(numeros.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 8 }, (_, i) => desde + i));
  });
});

describe("POST /empresas/:empresa/partidas/contabilizar (lote)", () => {
  it("contabiliza en orden de fecha y deja los descuadrados en la bandeja", async () => {
    const ultimo = (await c.query("select max(numero) as n from partidas")).rows[0].n as number;
    const del10 = await cuadrada("2026-11-10", "85.40");
    const descuadrada = await crearPartida(c, esc, "2026-11-09", [
      [esc.cuentas["110101"]!, "1130.00", "0"],
      [esc.cuentas["5101"]!, "0", "1105.00"],
    ]);
    const del09 = await cuadrada("2026-11-09", "120.00");

    const r = await post("/partidas/contabilizar", CONTADOR, { ids: [del10, descuadrada, del09, del10] });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({
      contabilizadas: [
        { id: del09, numero: ultimo + 1, ambito: "2026" },
        { id: del10, numero: ultimo + 2, ambito: "2026" },
      ],
      rechazadas: [
        {
          id: descuadrada,
          motivo: "no_cuadra",
          mensaje: "No cuadra: debe 1130.00, haber 1105.00, diferencia US$ 25.00.",
        },
      ],
    });
    expect(await estado(descuadrada)).toEqual({ estado: "borrador", numero: null });
  });

  it("si la base rechaza una partida a mitad del lote, la deshace sola y no deja huecos", async () => {
    // Regla de prueba: la base rechaza las partidas con concepto 'rechazar' al contabilizarlas
    await c.query(`
      create function pg_temp_rechazar() returns trigger language plpgsql as $$
      begin
        if new.estado = 'contabilizada' and new.concepto = 'rechazar' then
          raise exception 'Regla de prueba: partida rechazada';
        end if;
        return new;
      end $$;
      create trigger zz_rechazar before update on partidas for each row execute function pg_temp_rechazar();`);
    try {
      const ultimo = (await c.query("select max(numero) as n from partidas")).rows[0].n as number;
      const primera = await cuadrada("2026-11-13");
      const rechazada = await cuadrada("2026-11-14");
      const tercera = await cuadrada("2026-11-15");
      await c.query("update partidas set concepto = 'rechazar' where id = $1", [rechazada]);

      const r = await post("/partidas/contabilizar", CONTADOR, { ids: [primera, rechazada, tercera] });
      expect(r.cuerpo).toEqual({
        contabilizadas: [
          { id: primera, numero: ultimo + 1, ambito: "2026" },
          { id: tercera, numero: ultimo + 2, ambito: "2026" },
        ],
        rechazadas: [
          { id: rechazada, motivo: "regla_contable", mensaje: "Regla de prueba: partida rechazada" },
        ],
      });
      expect(await estado(rechazada)).toEqual({ estado: "borrador", numero: null });
      expect(await estado(tercera)).toEqual({ estado: "contabilizada", numero: ultimo + 2 });
    } finally {
      await c.query("drop trigger zz_rechazar on partidas; drop function pg_temp_rechazar()");
    }
  });

  it("informa las partidas que no encuentra sin detener las demás", async () => {
    const id = await cuadrada("2026-11-11");
    const r = await post("/partidas/contabilizar", CONTADOR, { ids: [AUXILIAR, id] });
    expect(r.cuerpo["contabilizadas"]).toHaveLength(1);
    expect(r.cuerpo["rechazadas"]).toEqual([
      { id: AUXILIAR, motivo: "no_encontrada", mensaje: "La partida no existe en esta empresa." },
    ]);
  });

  it("valida el cuerpo y el permiso", async () => {
    const vacio = await post("/partidas/contabilizar", CONTADOR, { ids: [] });
    expect(vacio.status).toBe(400);
    expect(vacio.cuerpo["errores"]).toEqual({ ids: ["Seleccione al menos una partida."] });

    const id = await cuadrada("2026-11-12");
    expect((await post("/partidas/contabilizar", AUXILIAR, { ids: [id] })).status).toBe(403);
  });
});
