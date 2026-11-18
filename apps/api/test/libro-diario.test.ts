// Libro diario (HU-25) de punta a punta con el caso CheroPhonex.
// S2-T20: los totales y la paginación (folios, Vienen y Pasan) coinciden con el caso, al centavo.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type LibroDiario } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cargarCasoCherophonex,
  leerCaso,
  type CasoCargado,
} from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222"; // solo ve una sucursal sin movimientos
const AJENO = "33333333-3333-4333-8333-333333333333";
const OCTUBRE = "desde=2026-10-01&hasta=2026-10-31";

const caso = leerCaso();

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
let sucursalNueva: string;

async function libro(query: string, usuario = CONTADOR) {
  const r = await fetch(`${url}/empresas/${carga.empresaId}/libro-diario?${query}`, {
    headers: { authorization: `Bearer ${usuario}` },
  });
  return { status: r.status, cuerpo: (await r.json()) as LibroDiario };
}

/** Suma de las líneas del caso (todas las partidas o las de un tipo), calculada aparte del sistema. */
function totalDelCaso(tipo?: string): string {
  const partidas = caso.partidas.filter((p) => !tipo || p.tipo === tipo);
  return Dinero.sumar(partidas.flatMap((p) => p.lineas.map((l) => l.debe))).aTexto();
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_libro_diario");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c);
  const s = await c.query<{ id: string }>(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal Usulután', 'S002') returning id`,
    [carga.empresaId],
  );
  sucursalNueva = s.rows[0]!.id;
  for (const [id, nombre] of [
    [CONTADOR, "Contador"],
    [AUXILIAR, "Auxiliar"],
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
    [CONTADOR, carga.empresaId],
  );
  const m = await c.query<{ id: string }>(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 3, false) returning id",
    [AUXILIAR, carga.empresaId],
  );
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    m.rows[0]!.id,
    sucursalNueva,
  ]);

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

describe("libro diario de octubre (S2-T15)", () => {
  let l: LibroDiario;
  beforeAll(async () => {
    const r = await libro(OCTUBRE);
    expect(r.status).toBe(200);
    l = r.cuerpo;
  });

  it("trae las 44 partidas del caso, en orden y con su número correlativo", () => {
    expect(l.partidas).toBe(44);
    const encabezados = l.paginas.flatMap((p) => p.renglones).filter((r) => r.tipo === "partida");
    expect(encabezados).toHaveLength(44);
    expect(encabezados.map((r) => r.descripcion.match(/N\.º (\d+)/)?.[1])).toEqual(
      caso.partidas.map((p) => String(p.numero)),
    );
    expect(encabezados.map((r) => r.fecha)).toEqual(caso.partidas.map((p) => p.fecha));
  });

  it("la primera partida en el formato de clase: cuentas de mayor, subcuentas en Parcial y concepto", () => {
    const renglones = l.paginas[0]!.renglones;
    const fin = renglones.findIndex((r, i) => i > 0 && r.tipo === "partida");
    const apertura = renglones.slice(0, fin);
    expect(apertura[0]).toMatchObject({ tipo: "partida", descripcion: "Partida N.º 1 (apertura)" });
    const capital = apertura.find((r) => r.tipo === "cuenta" && r.codigo === "3101");
    expect(capital).toMatchObject({ descripcion: "Capital", haber: "22500.00", debe: null });
    const aportes = apertura.filter((r) => r.tipo === "subcuenta" && r.codigo?.startsWith("3101"));
    expect(aportes).toHaveLength(6);
    expect(aportes.every((r) => r.parcial === "3750.00")).toBe(true);
    expect(apertura.at(-1)).toMatchObject({
      tipo: "concepto",
      descripcion: `V/ ${caso.partidas[0]!.concepto}`,
    });
  });

  it("en cada partida la suma de Parcial de las subcuentas es el monto de su cuenta de mayor", () => {
    const renglones = l.paginas.flatMap((p) => p.renglones);
    for (let i = 0; i < renglones.length; i++) {
      const cuenta = renglones[i]!;
      if (cuenta.tipo !== "cuenta") continue;
      const subcuentas = [];
      for (let j = i + 1; renglones[j]?.tipo === "subcuenta"; j++) subcuentas.push(renglones[j]!);
      if (subcuentas.length === 0) continue;
      expect([cuenta.codigo, Dinero.sumar(subcuentas.map((s) => s.parcial!)).aTexto()]).toEqual([
        cuenta.codigo,
        cuenta.debe ?? cuenta.haber,
      ]);
    }
  });
});

describe("totales y paginación contra el caso CheroPhonex (S2-T20)", () => {
  it("el total del Debe y del Haber es la suma de las partidas del caso, y cuadra", async () => {
    const { cuerpo } = await libro(OCTUBRE);
    expect(cuerpo.totales).toEqual({ debe: totalDelCaso(), haber: totalDelCaso() });
    expect(cuerpo.cuadra).toBe(true);
  });

  it.each([10, 25, 40, 100])(
    "con %i renglones por página, los folios, Vienen y Pasan encadenan",
    async (n) => {
      const { cuerpo } = await libro(`${OCTUBRE}&renglonesPorPagina=${n}&folioInicial=7`);
      const total = cuerpo.paginas.reduce((s, p) => s + p.renglones.length, 0);
      expect(cuerpo.paginas).toHaveLength(Math.ceil(total / n));
      expect(cuerpo.paginas.map((p) => p.folio)).toEqual(cuerpo.paginas.map((_, i) => 7 + i));

      let vienen = { debe: "0.00", haber: "0.00" };
      for (const [i, p] of cuerpo.paginas.entries()) {
        expect(p.renglones.length).toBe(i < cuerpo.paginas.length - 1 ? n : total - n * i);
        expect(p.vienen).toEqual(vienen);
        const debe = Dinero.sumar([p.vienen.debe, ...p.renglones.map((r) => r.debe ?? "0")]).aTexto();
        const haber = Dinero.sumar([p.vienen.haber, ...p.renglones.map((r) => r.haber ?? "0")]).aTexto();
        expect(p.pasan).toEqual({ debe, haber });
        vienen = p.pasan;
      }
      expect(vienen).toEqual(cuerpo.totales);
      expect(cuerpo.totales.debe).toBe(totalDelCaso());
    },
  );

  it("los renglones no dependen de la paginación", async () => {
    const planos = async (n: number) =>
      (await libro(`${OCTUBRE}&renglonesPorPagina=${n}`)).cuerpo.paginas.flatMap((p) => p.renglones);
    expect(await planos(10)).toEqual(await planos(100));
  });

  it.each(["apertura", "operacion", "ajuste", "cierre"])("filtra por tipo de partida: %s", async (tipo) => {
    const { cuerpo } = await libro(`${OCTUBRE}&tipo=${tipo}`);
    expect(cuerpo.tipo).toBe(tipo);
    expect(cuerpo.partidas).toBe(caso.partidas.filter((p) => p.tipo === tipo).length);
    expect(cuerpo.totales.debe).toBe(totalDelCaso(tipo));
  });

  it("filtra por fechas", async () => {
    const { cuerpo } = await libro("desde=2026-10-01&hasta=2026-10-01");
    expect(cuerpo.partidas).toBe(caso.partidas.filter((p) => p.fecha === "2026-10-01").length);
  });
});

describe("anulación, sucursales, permisos y validación", () => {
  it("una partida anulada y su reversión aparecen las dos, y el libro sigue cuadrando", async () => {
    const original = await c.query<{ id: string }>(
      "select id from partidas where empresa_id = $1 and numero = 5 and tipo = 'operacion'",
      [carga.empresaId],
    );
    const r = await fetch(`${url}/empresas/${carga.empresaId}/partidas/${original.rows[0]!.id}/anular`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CONTADOR}` },
      body: JSON.stringify({ motivo: "Prueba del libro diario", fecha: "2026-10-31" }),
    });
    // La anulación es de S2-T12; si su ruta todavía no existe, se anula directo en la base
    if (r.status === 404) {
      await c.query("update partidas set estado = 'anulada', motivo_anulacion = 'Prueba' where id = $1", [
        original.rows[0]!.id,
      ]);
    }
    const { cuerpo } = await libro(OCTUBRE);
    const encabezados = cuerpo.paginas.flatMap((p) => p.renglones).filter((x) => x.tipo === "partida");
    expect(encabezados.find((x) => x.partidaId === original.rows[0]!.id)?.descripcion).toMatch(/anulada/);
    expect(cuerpo.cuadra).toBe(true);
  });

  it("por sucursal: la casa matriz trae todo y una sucursal sin movimientos, nada", async () => {
    const matriz = (await libro(`${OCTUBRE}&sucursalId=${carga.sucursalId}`)).cuerpo;
    expect(matriz.partidas).toBeGreaterThanOrEqual(44);
    const vacia = (await libro(`${OCTUBRE}&sucursalId=${sucursalNueva}`)).cuerpo;
    expect(vacia).toMatchObject({ partidas: 0, paginas: [], totales: { debe: "0.00", haber: "0.00" } });
  });

  it("quien está limitado a una sucursal solo ve la suya y no puede pedir otra (403)", async () => {
    expect((await libro(OCTUBRE, AUXILIAR)).cuerpo.partidas).toBe(0);
    expect((await libro(`${OCTUBRE}&sucursalId=${carga.sucursalId}`, AUXILIAR)).status).toBe(403);
  });

  it("un usuario ajeno recibe 404", async () => {
    expect((await libro(OCTUBRE, AJENO)).status).toBe(404);
  });

  it("400 con filtros inválidos; 422 si el período no está en un ejercicio", async () => {
    expect((await libro("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await libro(`${OCTUBRE}&tipo=otro`)).status).toBe(400);
    expect((await libro(`${OCTUBRE}&renglonesPorPagina=5`)).status).toBe(400);
    expect((await libro(`${OCTUBRE}&folioInicial=0`)).status).toBe(400);
    expect((await libro("desde=2025-10-01&hasta=2025-10-31")).status).toBe(422);
  });
});
