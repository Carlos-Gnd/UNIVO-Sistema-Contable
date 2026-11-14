// Registro de partidas en borrador (HU-20, S1-T78) de punta a punta: HTTP → caso de uso → PostgreSQL.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { PartidaVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

/** Supabase simulado: "Bearer <id del usuario>" es un token válido de ese usuario. */
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let usulutanId: string;
let inactivaId: string;

async function pedir(metodo: string, ruta: string, usuario: string | null, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${esc.empresaId}/partidas${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as PartidaVista & Record<string, unknown> };
}

const crear = (usuario: string | null, cuerpo: unknown) => pedir("POST", "", usuario, cuerpo);
const editar = (id: string, usuario: string, cuerpo: unknown) => pedir("PUT", `/${id}`, usuario, cuerpo);
const consultar = (id: string, usuario: string) => pedir("GET", `/${id}`, usuario);

/** Partida de venta al contado; con `cobrado` distinto de `vendido` queda descuadrada. */
const venta = (vendido: string, cobrado = vendido, extra: Record<string, unknown> = {}) => ({
  sucursalId: esc.sucursalId,
  fecha: "2026-11-10",
  concepto: "Venta al contado",
  lineas: [
    { cuentaId: esc.cuentas["110101"], debe: cobrado },
    { cuentaId: esc.cuentas["5101"], haber: vendido, concepto: "Factura 15" },
  ],
  ...extra,
});

const cuantasPartidas = async () =>
  Number(
    (await c.query("select count(*) from partidas where empresa_id = $1", [esc.empresaId])).rows[0].count,
  );

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_partidas");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");
  ajena = await crearEscenario(c, "0614-010190-102-0");

  const sucursal = async (nombre: string, codigo: string, activa: boolean) =>
    (
      await c.query(
        `insert into sucursales (empresa_id, nombre, codigo_establecimiento, activa) values ($1, $2, $3, $4) returning id`,
        [esc.empresaId, nombre, codigo, activa],
      )
    ).rows[0].id as string;
  usulutanId = await sucursal("Sucursal Usulután", "S001", true);
  inactivaId = await sucursal("Sucursal cerrada", "S002", false);

  // Contador: todas las sucursales. Auxiliar y consulta: solo la casa matriz.
  const usuarios: [string, number, boolean][] = [
    [CONTADOR, 2, true],
    [AUXILIAR, 3, false],
    [CONSULTA, 4, false],
  ];
  for (const [id, rol, todas] of usuarios) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      `Usuario ${rol}`,
      `${id}@prueba.sv`,
    ]);
    const m = await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
      [id, esc.empresaId, rol, todas],
    );
    if (!todas) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        m.rows[0].id,
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

describe("POST /empresas/:empresa/partidas", () => {
  it("exige un token válido", async () => {
    expect((await crear(null, venta("10.00"))).status).toBe(401);
  });

  it("guarda un borrador descuadrado, sin número y con su diferencia", async () => {
    const r = await crear(AUXILIAR, venta("1130", "1105.5"));
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      sucursalId: esc.sucursalId,
      fecha: "2026-11-10",
      tipo: "operacion",
      estado: "borrador",
      numero: null,
      concepto: "Venta al contado",
      documentoTipo: null,
      documentoNumero: null,
      origen: "manual",
      totalDebe: "1105.50",
      totalHaber: "1130.00",
      diferencia: "24.50",
      cuadra: false,
    });
    expect(r.cuerpo.lineas).toEqual([
      {
        cuentaId: esc.cuentas["110101"],
        codigo: "110101",
        nombre: "Caja general",
        debe: "1105.50",
        haber: "0.00",
        concepto: null,
      },
      {
        cuentaId: esc.cuentas["5101"],
        codigo: "5101",
        nombre: "Ventas",
        debe: "0.00",
        haber: "1130.00",
        concepto: "Factura 15",
      },
    ]);

    // Queda a nombre del auxiliar en la partida y en la bitácora
    const fila = await c.query("select creado_por, periodo_id from partidas where id = $1", [r.cuerpo.id]);
    expect(fila.rows[0].creado_por).toBe(AUXILIAR);
    expect(fila.rows[0].periodo_id).not.toBeNull();
    const bitacora = await c.query(
      "select distinct usuario_id from bitacora where tabla in ('partidas', 'partida_detalles') and (registro_id = $1 or datos_nuevos ->> 'partida_id' = $1)",
      [r.cuerpo.id],
    );
    expect(bitacora.rows).toEqual([{ usuario_id: AUXILIAR }]);
  });

  it("acepta todos los tipos y el documento de soporte", async () => {
    const r = await crear(
      CONTADOR,
      venta("10", "10", {
        tipo: "ajuste",
        documentoTipo: "CCF",
        documentoNumero: "DTE-01-0001",
        concepto: "",
      }),
    );
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      tipo: "ajuste",
      documentoTipo: "CCF",
      documentoNumero: "DTE-01-0001",
      concepto: null,
      cuadra: true,
      diferencia: "0.00",
    });
  });

  it("valida la forma del cuerpo (400)", async () => {
    const r = await crear(CONTADOR, { sucursalId: "x", fecha: "10/11/2026", tipo: "otro", lineas: [] });
    expect(r.status).toBe(400);
    expect(Object.keys(r.cuerpo["errores"] as object).toSorted()).toEqual([
      "fecha",
      "lineas",
      "sucursalId",
      "tipo",
    ]);
    const negativo = await crear(CONTADOR, venta("-5"));
    expect(negativo.status).toBe(400);
  });

  it("responde 422 con los errores por línea y no guarda nada", async () => {
    const antes = await cuantasPartidas();
    const r = await crear(CONTADOR, {
      ...venta("10"),
      lineas: [
        { cuentaId: esc.cuentas["1101"], debe: "10" },
        { cuentaId: ajena.cuentas["5101"], haber: "10" },
        { cuentaId: esc.cuentas["5101"], debe: "1", haber: "1" },
      ],
    });
    expect(r.status).toBe(422);
    expect(r.cuerpo["lineas"]).toEqual([
      {
        linea: 0,
        codigo: "CUENTA_NO_IMPUTABLE",
        mensaje: "Solo se registran movimientos en cuentas de último nivel.",
      },
      {
        linea: 1,
        codigo: "CUENTA_INEXISTENTE",
        mensaje: "La cuenta no existe en el catálogo de la empresa.",
      },
      { linea: 2, codigo: "DEBE_Y_HABER", mensaje: "Una línea no puede tener debe y haber a la vez." },
    ]);
    expect(await cuantasPartidas()).toBe(antes);
  });

  it("responde 422 con el mensaje de la base si la fecha no tiene período o la sucursal está inactiva", async () => {
    const antes = await cuantasPartidas();
    const sinPeriodo = await crear(CONTADOR, venta("10", "10", { fecha: "2027-01-05" }));
    expect(sinPeriodo.status).toBe(422);
    expect(sinPeriodo.cuerpo["mensaje"]).toBe(
      "No existe un período para la fecha 05/01/2027; cree primero el ejercicio",
    );
    const inactiva = await crear(CONTADOR, venta("10", "10", { sucursalId: inactivaId }));
    expect(inactiva.status).toBe(422);
    expect(inactiva.cuerpo["mensaje"]).toBe(
      "La sucursal está inactiva; no se registran partidas nuevas en ella",
    );
    expect(await cuantasPartidas()).toBe(antes);
  });

  it("consulta no registra y el auxiliar solo registra en sus sucursales (403)", async () => {
    const antes = await cuantasPartidas();
    expect((await crear(CONSULTA, venta("10"))).status).toBe(403);
    expect((await crear(AUXILIAR, venta("10", "10", { sucursalId: usulutanId }))).status).toBe(403);
    expect(await cuantasPartidas()).toBe(antes);
    expect((await crear(CONTADOR, venta("10", "10", { sucursalId: usulutanId }))).status).toBe(201);
  });

  it("responde 404 en una empresa a la que no pertenece", async () => {
    const r = await fetch(`${url}/empresas/${ajena.empresaId}/partidas`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CONTADOR}` },
      body: JSON.stringify(venta("10")),
    });
    expect(r.status).toBe(404);
  });
});

describe("PUT y GET /empresas/:empresa/partidas/:partida", () => {
  it("completa un borrador: reemplaza la cabecera y las líneas", async () => {
    const { cuerpo: borrador } = await crear(AUXILIAR, venta("100", "90"));
    const r = await editar(borrador.id, AUXILIAR, {
      ...venta("100", "100", { fecha: "2026-11-12", concepto: "Venta corregida" }),
      lineas: [
        { cuentaId: esc.cuentas["110101"], debe: "60" },
        { cuentaId: esc.cuentas["110101"], debe: "40" },
        { cuentaId: esc.cuentas["5101"], haber: "100" },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      id: borrador.id,
      fecha: "2026-11-12",
      concepto: "Venta corregida",
      estado: "borrador",
      totalDebe: "100.00",
      totalHaber: "100.00",
      cuadra: true,
    });
    expect(r.cuerpo.lineas.map((l) => [l.codigo, l.debe, l.haber])).toEqual([
      ["110101", "60.00", "0.00"],
      ["110101", "40.00", "0.00"],
      ["5101", "0.00", "100.00"],
    ]);
    expect((await consultar(borrador.id, CONSULTA)).cuerpo).toEqual(r.cuerpo);

    // Al editar no cambia quién la registró
    const fila = await c.query("select creado_por from partidas where id = $1", [borrador.id]);
    expect(fila.rows[0].creado_por).toBe(AUXILIAR);
  });

  it("una línea inválida no altera el borrador", async () => {
    const { cuerpo: borrador } = await crear(CONTADOR, venta("20"));
    const r = await editar(borrador.id, CONTADOR, {
      ...venta("20"),
      lineas: [{ cuentaId: esc.cuentas["1101"], debe: "20" }],
    });
    expect(r.status).toBe(422);
    expect((await consultar(borrador.id, CONTADOR)).cuerpo).toEqual(borrador);
  });

  it("después de contabilizarla ya no se edita aquí (409)", async () => {
    const { cuerpo: borrador } = await crear(CONTADOR, venta("30"));
    const contabilizada = await fetch(
      `${url}/empresas/${esc.empresaId}/partidas/${borrador.id}/contabilizar`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${CONTADOR}` },
      },
    );
    expect(contabilizada.status).toBe(200);
    const r = await editar(borrador.id, CONTADOR, venta("35"));
    expect(r.status).toBe(409);
    expect(r.cuerpo["message"]).toBe("La partida está contabilizada; solo se editan borradores.");
    expect((await consultar(borrador.id, CONTADOR)).cuerpo).toMatchObject({
      estado: "contabilizada",
      numero: 1,
    });
  });

  it("el auxiliar no ve ni edita borradores de otras sucursales, ni mueve los suyos a ellas", async () => {
    const { cuerpo: deUsulutan } = await crear(CONTADOR, venta("40", "40", { sucursalId: usulutanId }));
    expect((await consultar(deUsulutan.id, AUXILIAR)).status).toBe(404);
    expect((await editar(deUsulutan.id, AUXILIAR, venta("40"))).status).toBe(404);
    expect((await consultar(deUsulutan.id, CONTADOR)).status).toBe(200);

    const { cuerpo: propio } = await crear(AUXILIAR, venta("50"));
    const mover = await editar(propio.id, AUXILIAR, venta("50", "50", { sucursalId: usulutanId }));
    expect(mover.status).toBe(403);
    expect((await consultar(propio.id, AUXILIAR)).cuerpo.sucursalId).toBe(esc.sucursalId);
  });

  it("consulta no edita y nadie ve partidas de otra empresa", async () => {
    const { cuerpo: borrador } = await crear(CONTADOR, venta("60"));
    expect((await editar(borrador.id, CONSULTA, venta("61"))).status).toBe(403);

    const deOtra = await c.query(
      `insert into partidas (empresa_id, sucursal_id, fecha) values ($1, $2, '2026-11-10') returning id`,
      [ajena.empresaId, ajena.sucursalId],
    );
    expect((await consultar(deOtra.rows[0].id, CONTADOR)).status).toBe(404);
    expect((await editar(deOtra.rows[0].id, CONTADOR, venta("10"))).status).toBe(404);
    expect((await consultar(CONTADOR, CONTADOR)).status).toBe(404);
    expect((await consultar("no-es-uuid", CONTADOR)).status).toBe(400);
  });
});
