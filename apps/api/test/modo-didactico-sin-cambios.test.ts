// S4-T39 (HU-89): activar o desactivar el modo didáctico no cambia ningún dato contable. Las partidas, sus líneas, el
// catálogo, los libros y la balanza quedan idénticos; la preferencia solo cambia la columna del propio usuario.
// Usa una base propia (contable_api_didactico_datos) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { PartidaVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  basePropia,
  contabilizar,
  crearEscenario,
  crearPartida,
  reiniciarBase,
  type Escenario,
} from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const ESTUDIANTE = "22222222-2222-4222-8222-222222222222";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ventaId: string;
let manualId: string;
let borradorId: string;

async function pedir(metodo: "GET" | "PATCH", ruta: string, usuario: string, cuerpo?: unknown) {
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${usuario}`, "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as unknown };
}

const cambiarModo = async (usuario: string, activo: boolean) => {
  const r = await pedir("PATCH", "/usuarios/me/modo-didactico", usuario, { activo });
  expect(r).toEqual({ status: 200, cuerpo: { activo } });
};

/** Todo lo contable de la empresa, tal como está guardado. */
async function datosGuardados() {
  const consulta = async (sql: string) => (await c.query(sql, [esc.empresaId])).rows;
  return {
    partidas: await consulta("select * from partidas where empresa_id = $1 order by id"),
    lineas: await consulta(
      `select d.* from partida_detalles d join partidas p on p.id = d.partida_id
       where p.empresa_id = $1 order by d.partida_id, d.orden`,
    ),
    cuentas: await consulta("select * from cuentas where empresa_id = $1 order by codigo"),
    periodos: await consulta("select * from periodos where empresa_id = $1 order by fecha_inicio"),
    empresa: await consulta("select * from empresas where id = $1"),
  };
}

/** Lo que muestran las pantallas de partidas y los reportes que se construyen con ellas. */
async function loQueSeConsulta(usuario: string) {
  const e = `/empresas/${esc.empresaId}`;
  const periodo = "desde=2026-11-01&hasta=2026-11-30";
  const rutas = [
    `${e}/partidas/${ventaId}`,
    `${e}/partidas/${manualId}`,
    `${e}/partidas/${borradorId}`,
    `${e}/partidas/borradores`,
    `${e}/libro-diario?${periodo}`,
    `${e}/cuentas/${esc.cuentas["110101"]}/libro-mayor?${periodo}`,
    `${e}/cuentas/${esc.cuentas["5101"]}/libro-mayor?${periodo}`,
    `${e}/balanzas/antes-ajustes?${periodo}`,
  ];
  const respuestas: Record<string, unknown> = {};
  for (const ruta of rutas) {
    const r = await pedir("GET", ruta, usuario);
    expect(r.status, `${ruta}: ${JSON.stringify(r.cuerpo)}`).toBe(200);
    respuestas[ruta] = r.cuerpo;
  }
  return respuestas;
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_didactico_datos");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-8");
  for (const [id, nombre] of [
    [CONTADOR, "Contador"],
    [ESTUDIANTE, "Estudiante"],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${id.slice(0, 8)}@didactico.test`,
    ]);
    await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
      [id, esc.empresaId],
    );
  }
  const caja = esc.cuentas["110101"]!;
  const ventas = esc.cuentas["5101"]!;
  // Partida automática de una venta (lleva explicación), una manual y un borrador automático
  ventaId = await crearPartida(
    c,
    esc,
    "2026-11-10",
    [
      [caja, "1130.10", "0"],
      [ventas, "0", "1130.10"],
    ],
    "operacion",
    { origen: "ventas", origenId: "" },
  );
  await contabilizar(c, ventaId);
  manualId = await crearPartida(c, esc, "2026-11-12", [
    [caja, "250.05", "0"],
    [ventas, "0", "250.05"],
  ]);
  await contabilizar(c, manualId);
  borradorId = await crearPartida(
    c,
    esc,
    "2026-11-20",
    [
      [caja, "0.01", "0"],
      [ventas, "0", "0.01"],
    ],
    "operacion",
    { origen: "recurrente", origenId: "" },
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
}, 60_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("el modo didáctico no cambia ningún dato (S4-T39)", () => {
  let guardadoAntes: Awaited<ReturnType<typeof datosGuardados>>;
  let consultadoAntes: Awaited<ReturnType<typeof loQueSeConsulta>>;

  it("con el modo desactivado, la partida automática ya trae su explicación y la manual no", async () => {
    guardadoAntes = await datosGuardados();
    consultadoAntes = await loQueSeConsulta(ESTUDIANTE);
    const venta = consultadoAntes[`/empresas/${esc.empresaId}/partidas/${ventaId}`] as PartidaVista;
    const manual = consultadoAntes[`/empresas/${esc.empresaId}/partidas/${manualId}`] as PartidaVista;
    expect(venta.explicacionDidactica?.regla.codigo).toBe("ventas");
    expect(manual.explicacionDidactica).toBeNull();
  });

  it("la explicación repite los importes de la partida sin tocarlos", () => {
    const venta = consultadoAntes[`/empresas/${esc.empresaId}/partidas/${ventaId}`] as PartidaVista;
    expect(venta.explicacionDidactica?.esquemaT).toEqual({
      debe: [{ codigo: "110101", nombre: "Caja general", monto: venta.lineas[0]!.debe }],
      haber: [{ codigo: "5101", nombre: "Ventas", monto: venta.lineas[1]!.haber }],
    });
    expect(venta).toMatchObject({ totalDebe: "1130.10", totalHaber: "1130.10", diferencia: "0.00" });
  });

  it("activarlo no cambia lo guardado ni lo que muestran las partidas, los libros y la balanza", async () => {
    await cambiarModo(ESTUDIANTE, true);
    expect(await datosGuardados()).toEqual(guardadoAntes);
    expect(await loQueSeConsulta(ESTUDIANTE)).toEqual(consultadoAntes);
  });

  it("un usuario con el modo activo y otro sin él ven exactamente los mismos datos", async () => {
    expect((await pedir("GET", "/usuarios/me/modo-didactico", CONTADOR)).cuerpo).toEqual({ activo: false });
    expect(await loQueSeConsulta(CONTADOR)).toEqual(await loQueSeConsulta(ESTUDIANTE));
  });

  it("activarlo y desactivarlo varias veces tampoco cambia nada", async () => {
    for (const activo of [false, true, true, false]) await cambiarModo(ESTUDIANTE, activo);
    expect(await datosGuardados()).toEqual(guardadoAntes);
    expect(await loQueSeConsulta(ESTUDIANTE)).toEqual(consultadoAntes);
  });

  it("la preferencia solo cambia la columna modo_didactico del propio usuario", async () => {
    const usuarios = async () =>
      (await c.query("select * from usuarios where id in ($1, $2) order by id", [CONTADOR, ESTUDIANTE])).rows;
    const antes = await usuarios();
    await cambiarModo(ESTUDIANTE, true);
    const despues = await usuarios();
    expect(despues[0]).toEqual(antes[0]);
    expect([antes[1].modo_didactico, despues[1].modo_didactico]).toEqual([false, true]);
    // Fuera de la preferencia y de la marca de actualización, el perfil queda igual
    const sinPreferencia = (fila: Record<string, unknown>) => {
      const copia = { ...fila };
      delete copia["modo_didactico"];
      delete copia["actualizado_en"];
      return copia;
    };
    expect(sinPreferencia(despues[1])).toEqual(sinPreferencia(antes[1]));
  });

  it("no consume números de partida ni crea partidas o líneas nuevas", async () => {
    const conteo = async () =>
      (
        await c.query(
          `select (select count(*)::int from partidas where empresa_id = $1) partidas,
                  (select count(*)::int from partida_detalles d join partidas p on p.id = d.partida_id
                    where p.empresa_id = $1) lineas,
                  (select max(numero) from partidas where empresa_id = $1) ultimo`,
          [esc.empresaId],
        )
      ).rows[0];
    const antes = await conteo();
    await cambiarModo(ESTUDIANTE, false);
    await cambiarModo(ESTUDIANTE, true);
    await loQueSeConsulta(ESTUDIANTE);
    expect(await conteo()).toEqual(antes);
    expect(antes).toEqual({ partidas: 3, lineas: 6, ultimo: 2 });
  });
});
