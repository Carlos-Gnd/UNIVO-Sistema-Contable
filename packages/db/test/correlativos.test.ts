// Prueba de concurrencia de correlativos (S1-T87, HU-22): varias conexiones contabilizan a la vez y
// los números no se repiten ni se saltan, dentro de cada ámbito de numeración y de cada empresa.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, crearPartida, reiniciarBase, URL_PRUEBAS, type Escenario } from "./helpers";

let c: pg.Client;
let pool: pg.Pool;
let nits = 0;

/** Cada prueba usa su propia empresa, así su numeración empieza en 1. */
const nuevaEmpresa = (modo = "anual") =>
  crearEscenario(c, `0614-200000-${String(++nits).padStart(3, "0")}-0`, modo);

const partida = (esc: Escenario, fecha: string, monto = "10", tipo = "operacion", haber = monto) =>
  crearPartida(
    c,
    esc,
    fecha,
    [
      [esc.cuentas["110101"]!, monto, "0"],
      [esc.cuentas["5101"]!, "0", haber],
    ],
    tipo,
  );

const varias = async (n: number, crear: () => Promise<string>) => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await crear());
  return ids;
};

/** Contabiliza en una conexión propia del pool (cada sentencia es su propia transacción). */
const contabilizar = (id: string) =>
  pool
    .query<{ numero: number; ambito: string }>(
      "update partidas set estado = 'contabilizada' where id = $1 returning numero, ambito_numeracion as ambito",
      [id],
    )
    .then((r) => r.rows[0]!);

/** Los números, ordenados, deben ser exactamente 1, 2, …, n. */
const esSecuenciaCompleta = (numeros: number[]) =>
  expect(numeros.toSorted((a, b) => a - b)).toEqual(Array.from({ length: numeros.length }, (_, i) => i + 1));

const ultimo = async (esc: Escenario, ambito: string) =>
  (
    await c.query("select ultimo from correlativos where empresa_id = $1 and ambito = $2", [
      esc.empresaId,
      ambito,
    ])
  ).rows[0]?.ultimo as number | undefined;

/** true si la promesa sigue pendiente después de `ms` milisegundos. */
const sigueEsperando = (p: Promise<unknown>, ms = 300) =>
  Promise.race([p.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), ms))]);

beforeAll(async () => {
  c = await reiniciarBase();
  pool = new pg.Pool({ connectionString: URL_PRUEBAS, max: 25 });
});
afterAll(async () => {
  await pool?.end();
  await c?.end();
});

describe("correlativos con contabilizaciones simultáneas", () => {
  it("25 conexiones a la vez reciben 1…25 sin repetir ni saltar", async () => {
    const esc = await nuevaEmpresa();
    const ids = await varias(25, () => partida(esc, "2026-11-10"));

    const resultados = await Promise.all(ids.map(contabilizar));

    esSecuenciaCompleta(resultados.map((r) => r.numero));
    expect(new Set(resultados.map((r) => r.ambito))).toEqual(new Set(["2026"]));
    expect(await ultimo(esc, "2026")).toBe(25);
  });

  it("la misma partida contabilizada a la vez desde dos conexiones consume un solo número", async () => {
    const esc = await nuevaEmpresa();
    const [id] = await varias(1, () => partida(esc, "2026-11-10"));

    const [a, b] = await Promise.all([contabilizar(id!), contabilizar(id!)]);

    expect(a.numero).toBe(1);
    expect(b.numero).toBe(1);
    expect(await ultimo(esc, "2026")).toBe(1);
  });

  it("si una transacción se deshace, la que esperaba recibe ese mismo número", async () => {
    const esc = await nuevaEmpresa();
    const [primera, segunda, tercera] = await varias(3, () => partida(esc, "2026-11-10"));

    const a = await pool.connect();
    try {
      await a.query("begin");
      const r = await a.query("update partidas set estado = 'contabilizada' where id = $1 returning numero", [
        primera,
      ]);
      expect(r.rows[0].numero).toBe(1);

      // La segunda queda bloqueada en el correlativo hasta que la primera termine
      const enEspera = contabilizar(segunda!);
      expect(await sigueEsperando(enEspera)).toBe(true);

      await a.query("rollback");
      expect((await enEspera).numero).toBe(1);
    } finally {
      a.release();
    }

    expect((await contabilizar(tercera!)).numero).toBe(2);
    const estado = await c.query("select estado, numero from partidas where id = $1", [primera]);
    expect(estado.rows[0]).toEqual({ estado: "borrador", numero: null });
  });

  it("las que la base rechaza al confirmar (descuadradas) no dejan huecos entre las demás", async () => {
    const esc = await nuevaEmpresa();
    const cuadradas = await varias(12, () => partida(esc, "2026-11-10"));
    const descuadradas = await varias(6, () => partida(esc, "2026-11-10", "10", "operacion", "9"));
    // Se intercalan para que las rechazadas tomen número en medio de las demás
    const todas = cuadradas.flatMap((id, i) => [id, ...(descuadradas[i] ? [descuadradas[i]] : [])]);

    const resultados = await Promise.allSettled(todas.map(contabilizar));

    const rechazadas = resultados.filter((r) => r.status === "rejected");
    expect(rechazadas).toHaveLength(6);
    for (const r of rechazadas) expect(String(r.reason)).toMatch(/no cuadra/);
    esSecuenciaCompleta(resultados.flatMap((r) => (r.status === "fulfilled" ? [r.value.numero] : [])));
    expect(await ultimo(esc, "2026")).toBe(12);

    const sinNumero = await c.query(
      "select count(*)::int as n from partidas where id = any($1) and estado = 'borrador' and numero is null",
      [descuadradas],
    );
    expect(sinNumero.rows[0].n).toBe(6);
  });

  it("numeración mensual: cada mes lleva su propia secuencia aunque se contabilicen mezclados", async () => {
    const esc = await nuevaEmpresa("mensual");
    const octubre = await varias(8, () => partida(esc, "2026-10-15"));
    const noviembre = await varias(8, () => partida(esc, "2026-11-15"));

    const resultados = await Promise.all(octubre.flatMap((id, i) => [id, noviembre[i]!]).map(contabilizar));

    const del = (ambito: string) => resultados.filter((r) => r.ambito === ambito).map((r) => r.numero);
    esSecuenciaCompleta(del("2026-10"));
    esSecuenciaCompleta(del("2026-11"));
    expect(del("2026-10")).toHaveLength(8);
  });

  it("numeración por tipo: operación y ajuste no comparten números", async () => {
    const esc = await nuevaEmpresa("por_tipo");
    const operaciones = await varias(7, () => partida(esc, "2026-11-10", "10", "operacion"));
    const ajustes = await varias(5, () => partida(esc, "2026-11-10", "10", "ajuste"));

    const resultados = await Promise.all([...ajustes, ...operaciones].map(contabilizar));

    const del = (ambito: string) => resultados.filter((r) => r.ambito === ambito).map((r) => r.numero);
    esSecuenciaCompleta(del("2026-operacion"));
    esSecuenciaCompleta(del("2026-ajuste"));
    expect([del("2026-operacion").length, del("2026-ajuste").length]).toEqual([7, 5]);
  });

  it("dos empresas que contabilizan a la vez no se afectan entre sí", async () => {
    const una = await nuevaEmpresa();
    const otra = await nuevaEmpresa();
    const deUna = await varias(10, () => partida(una, "2026-11-10"));
    const deOtra = await varias(10, () => partida(otra, "2026-11-10"));

    const [r1, r2] = await Promise.all([
      Promise.all(deUna.map(contabilizar)),
      Promise.all(deOtra.map(contabilizar)),
    ]);

    esSecuenciaCompleta(r1.map((r) => r.numero));
    esSecuenciaCompleta(r2.map((r) => r.numero));
  });
});
