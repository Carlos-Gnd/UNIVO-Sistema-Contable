// Cajas y cuentas bancarias (HU-76, S3-T112 y S3-T114): vínculo con la cuenta contable, saldo actual y alcance
// por sucursal. Usa una base propia (contable_api_tesoreria) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CuentaTesoreriaVista } from "@contable/shared";
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
const AUXILIAR_MATRIZ = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let usulutanId: string;
const cuentas: Record<string, string> = {};

async function pedir(
  metodo: string,
  ruta: string,
  usuario: string | null,
  cuerpo?: unknown,
  empresa = esc.empresaId,
) {
  const r = await fetch(`${url}/empresas/${empresa}/cuentas-tesoreria${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const lista = async (usuario: string) =>
  (await pedir("GET", "", usuario)).cuerpo as unknown as CuentaTesoreriaVista[];

async function cuenta(codigo: string, nombre: string) {
  const r = await c.query(
    `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, 'deudora', 'activo') returning id`,
    [esc.empresaId, codigo, nombre],
  );
  cuentas[codigo] = r.rows[0].id as string;
}

async function usuario(id: string, rol: number, sucursal: string | null, empresa = esc) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `U${rol}`,
    `u${id.slice(0, 4)}@tesoreria.test`,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
    [id, empresa.empresaId, rol, sucursal === null],
  );
  if (sucursal) {
    await c.query(
      "insert into membresia_sucursales (membresia_id, sucursal_id) select id, $2 from membresias where usuario_id = $1 and empresa_id = $3",
      [id, sucursal, empresa.empresaId],
    );
  }
}

const caja = (extra: Record<string, unknown> = {}) => ({
  tipo: "caja",
  nombre: "Caja general",
  cuentaId: cuentas["110101"],
  ...extra,
});
const banco = (extra: Record<string, unknown> = {}) => ({
  tipo: "banco",
  nombre: "Banco Agrícola corriente",
  cuentaId: cuentas["11010301"],
  banco: "Banco Agrícola",
  numeroCuenta: "001-234567-8",
  ...extra,
});

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_tesoreria");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");
  ajena = await crearEscenario(c, "0614-010190-102-0");
  cuentas["110101"] = esc.cuentas["110101"]!;
  cuentas["5101"] = esc.cuentas["5101"]!;
  cuentas["1101"] = esc.cuentas["1101"]!;
  for (const [codigo, nombre] of [
    ["110102", "Caja chica"],
    ["110103", "Bancos"],
    ["11010301", "Cuenta corriente"],
    ["11010302", "Cuenta de ahorro"],
  ] as const) {
    await cuenta(codigo, nombre);
  }
  usulutanId = (
    await c.query(
      `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Usulután', 'S002') returning id`,
      [esc.empresaId],
    )
  ).rows[0].id as string;
  await usuario(CONTADOR, 2, null);
  await usuario(AUXILIAR_MATRIZ, 3, esc.sucursalId);
  await usuario(CONSULTA, 4, esc.sucursalId);
  await usuario(FORASTERO, 2, null, ajena);

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

describe("registro de cajas y cuentas bancarias", () => {
  it("una caja y un banco se vinculan a su cuenta contable y empiezan con saldo cero", async () => {
    const c1 = await pedir("POST", "", CONTADOR, caja());
    expect(c1.status).toBe(201);
    expect(c1.cuerpo).toMatchObject({
      tipo: "caja",
      cuentaCodigo: "110101",
      cuentaNombre: "Caja general",
      saldo: "0.00",
      activa: true,
    });
    const b1 = await pedir("POST", "", CONTADOR, banco());
    expect(b1.status).toBe(201);
    expect(b1.cuerpo).toMatchObject({
      tipo: "banco",
      banco: "Banco Agrícola",
      numeroCuenta: "001-234567-8",
      cuentaCodigo: "11010301",
    });
  });

  it("un banco necesita su entidad y número de cuenta; una caja no los lleva", async () => {
    expect(
      (await pedir("POST", "", CONTADOR, banco({ banco: undefined, cuentaId: cuentas["11010302"] }))).status,
    ).toBe(400);
    expect(
      (await pedir("POST", "", CONTADOR, banco({ numeroCuenta: undefined, cuentaId: cuentas["11010302"] })))
        .status,
    ).toBe(400);
    expect(
      (await pedir("POST", "", CONTADOR, caja({ banco: "Banco X", cuentaId: cuentas["110102"] }))).status,
    ).toBe(400);
  });

  it("rechaza cuentas contables repetidas, que no son de efectivo o con subcuentas", async () => {
    expect((await pedir("POST", "", CONTADOR, caja({ nombre: "Otra" }))).status).toBe(409);
    const ventas = await pedir("POST", "", CONTADOR, caja({ cuentaId: cuentas["5101"] }));
    expect(ventas.status).toBe(422);
    expect(ventas.cuerpo["message"]).toMatch(/subcuenta de efectivo/);
    const conHijas = await pedir("POST", "", CONTADOR, banco({ cuentaId: cuentas["110103"] }));
    expect(conHijas.status).toBe(422);
    expect(conHijas.cuerpo["message"]).toMatch(/subcuentas/);
  });

  it("el número de cuenta no se repite en el mismo banco", async () => {
    const r = await pedir("POST", "", CONTADOR, banco({ cuentaId: cuentas["11010302"], nombre: "Ahorro" }));
    expect(r.status).toBe(409);
    expect(r.cuerpo["message"]).toMatch(/Ya existe la cuenta 001-234567-8/);
    expect(
      (await pedir("POST", "", CONTADOR, banco({ cuentaId: cuentas["11010302"], numeroCuenta: "001-999" })))
        .status,
    ).toBe(201);
  });

  it("una cuenta contable o una sucursal de otra empresa no existen para esta", async () => {
    expect(
      (await pedir("POST", "", CONTADOR, caja({ cuentaId: ajena.cuentas["110101"], nombre: "Ajena" })))
        .status,
    ).toBe(404);
    expect(
      (await pedir("POST", "", CONTADOR, caja({ cuentaId: cuentas["110102"], sucursalId: ajena.sucursalId })))
        .status,
    ).toBe(404);
  });

  it("se edita el nombre, se inactiva y no se cambia el tipo ni la cuenta contable", async () => {
    const [caja1] = (await lista(CONTADOR)).filter((x) => x.tipo === "caja");
    const editada = await pedir("PATCH", `/${caja1!.id}`, CONTADOR, {
      nombre: "Caja principal",
      cuentaId: cuentas["110102"],
      tipo: "banco",
    });
    expect(editada.status).toBe(200);
    expect(editada.cuerpo).toMatchObject({ nombre: "Caja principal", tipo: "caja", cuentaCodigo: "110101" });
    expect((await pedir("PATCH", `/${caja1!.id}`, CONTADOR, { activa: false })).cuerpo).toMatchObject({
      activa: false,
    });
    expect((await pedir("PATCH", `/${caja1!.id}`, CONTADOR, {})).status).toBe(400);
    // una caja no puede recibir datos de banco
    expect((await pedir("PATCH", `/${caja1!.id}`, CONTADOR, { banco: "Banco X" })).status).toBe(422);
    await pedir("PATCH", `/${caja1!.id}`, CONTADOR, { activa: true });
  });
});

describe("saldo actual", () => {
  it("sale de las partidas contabilizadas de su cuenta contable y no cuenta los borradores", async () => {
    const [caja1] = (await lista(CONTADOR)).filter((x) => x.tipo === "caja" && x.cuentaCodigo === "110101");
    const venta = await crearPartida(c, esc, "2026-10-08", [
      [cuentas["110101"]!, "600.00", "0"],
      [cuentas["5101"]!, "0", "600.00"],
    ]);
    await contabilizar(c, venta);
    await crearPartida(c, esc, "2026-10-09", [
      [cuentas["110101"]!, "50.00", "0"],
      [cuentas["5101"]!, "0", "50.00"],
    ]); // borrador
    const pago = await crearPartida(c, esc, "2026-10-10", [
      [cuentas["5101"]!, "150.25", "0"],
      [cuentas["110101"]!, "0", "150.25"],
    ]);
    await contabilizar(c, pago);

    const ahora = (await lista(CONTADOR)).find((x) => x.id === caja1!.id)!;
    expect(ahora.saldo).toBe("449.75");
    const banco1 = (await lista(CONTADOR)).find((x) => x.tipo === "banco" && x.cuentaCodigo === "11010301")!;
    expect(banco1.saldo).toBe("0.00");
  });

  it("una partida contabilizada y su reversión se compensan", async () => {
    const original = await crearPartida(c, esc, "2026-10-12", [
      [cuentas["11010301"]!, "1000.00", "0"],
      [cuentas["5101"]!, "0", "1000.00"],
    ]);
    await contabilizar(c, original);
    const banco1 = (await lista(CONTADOR)).find((x) => x.cuentaCodigo === "11010301")!;
    expect(banco1.saldo).toBe("1000.00");
    // su reversión, con las cuentas invertidas, deja el saldo en cero
    const reversion = await crearPartida(
      c,
      esc,
      "2026-10-13",
      [
        [cuentas["5101"]!, "1000.00", "0"],
        [cuentas["11010301"]!, "0", "1000.00"],
      ],
      "reversion",
    );
    await contabilizar(c, reversion);
    const despues = (await lista(CONTADOR)).find((x) => x.cuentaCodigo === "11010301")!;
    expect(despues.saldo).toBe("0.00");
  });

  it("una caja de una sucursal solo suma las partidas de esa sucursal", async () => {
    const cajaUsulutan = await pedir(
      "POST",
      "",
      CONTADOR,
      caja({ cuentaId: cuentas["110102"], nombre: "Caja Usulután", sucursalId: usulutanId }),
    );
    expect(cajaUsulutan.status).toBe(201);
    const escUsulutan = { ...esc, sucursalId: usulutanId };
    const enUsulutan = await crearPartida(c, escUsulutan, "2026-10-14", [
      [cuentas["110102"]!, "75.00", "0"],
      [cuentas["5101"]!, "0", "75.00"],
    ]);
    await contabilizar(c, enUsulutan);
    const enMatriz = await crearPartida(c, esc, "2026-10-14", [
      [cuentas["110102"]!, "20.00", "0"],
      [cuentas["5101"]!, "0", "20.00"],
    ]);
    await contabilizar(c, enMatriz);
    const vista = (await lista(CONTADOR)).find((x) => x.nombre === "Caja Usulután")!;
    expect(vista).toMatchObject({ sucursal: "Usulután", saldo: "75.00" });
  });
});

describe("permisos y alcance por sucursal", () => {
  it("quien solo consulta ve las cuentas y sus saldos pero no registra", async () => {
    expect((await pedir("GET", "", CONSULTA)).status).toBe(200);
    expect((await pedir("POST", "", CONSULTA, caja({ cuentaId: cuentas["110102"] }))).status).toBe(403);
    expect((await pedir("GET", "", null)).status).toBe(401);
    // quien no es miembro de la empresa ni siquiera la ve
    expect((await pedir("GET", "", FORASTERO)).status).toBe(404);
  });

  it("un usuario limitado a la matriz ve solo las cuentas de su sucursal, no las de toda la empresa", async () => {
    const sucursalMatriz = await c.query(
      `select cuenta_id from cuentas_tesoreria where empresa_id = $1 and sucursal_id = $2`,
      [esc.empresaId, esc.sucursalId],
    );
    expect(sucursalMatriz.rows).toHaveLength(0);
    // el contador la asigna a la matriz y entonces el auxiliar de la matriz la ve
    const [caja1] = (await lista(CONTADOR)).filter((x) => x.cuentaCodigo === "110101");
    expect((await lista(AUXILIAR_MATRIZ)).map((x) => x.id)).not.toContain(caja1!.id);
    await pedir("PATCH", `/${caja1!.id}`, CONTADOR, { sucursalId: esc.sucursalId });
    expect((await lista(AUXILIAR_MATRIZ)).map((x) => x.id)).toEqual([caja1!.id]);
    expect((await lista(CONTADOR)).length).toBeGreaterThan(1);
  });

  it("el auxiliar no crea cuentas de toda la empresa ni de otra sucursal", async () => {
    const global = await pedir("POST", "", AUXILIAR_MATRIZ, caja({ cuentaId: cuentas["110102"] }));
    expect(global.status).toBe(403);
    const otraSucursal = await pedir(
      "POST",
      "",
      AUXILIAR_MATRIZ,
      caja({ cuentaId: cuentas["110102"], sucursalId: usulutanId }),
    );
    expect(otraSucursal.status).toBe(403);
  });

  it("cada alta y cambio queda en la bitácora a nombre de quien lo hizo", async () => {
    const filas = await c.query(
      `select distinct usuario_id from bitacora where empresa_id = $1 and tabla = 'cuentas_tesoreria'`,
      [esc.empresaId],
    );
    expect(filas.rows.map((f) => f.usuario_id)).toContain(CONTADOR);
  });
});
