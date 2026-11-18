import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { PartidaVista } from "@contable/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const CONTADOR_LIMITADO = "44444444-4444-4444-8444-444444444444";
const CONTADOR_AJENA = "55555555-5555-4555-8555-555555555555";
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let sucursalFuera: string;

const datos = (concepto: string, sucursalId = esc.sucursalId, monto = "100", escenario = esc) => ({
  sucursalId,
  fecha: "2026-11-10",
  tipo: "operacion",
  concepto,
  lineas: [
    { cuentaId: escenario.cuentas["110101"], debe: monto },
    { cuentaId: escenario.cuentas["5101"], haber: monto },
  ],
});

async function pedir(metodo: string, ruta: string, usuario: string, cuerpo?: unknown) {
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${usuario}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as PartidaVista & Record<string, unknown> };
}

async function crearContabilizada(concepto = "Original", sucursalId = esc.sucursalId) {
  const creada = await pedir("POST", `/empresas/${esc.empresaId}/partidas`, CONTADOR, datos(concepto, sucursalId));
  expect(creada.status).toBe(201);
  const contabilizada = await pedir(
    "POST",
    `/empresas/${esc.empresaId}/partidas/${creada.cuerpo.id}/contabilizar`,
    CONTADOR,
  );
  expect(contabilizada.status).toBe(200);
  return contabilizada.cuerpo;
}

const editar = (id: string, usuario: string, cuerpo: unknown) =>
  pedir("PUT", `/empresas/${esc.empresaId}/partidas/${id}/contabilizada`, usuario, cuerpo);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_editar_partida_contabilizada");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-020190-101-4");
  ajena = await crearEscenario(c, "0614-020190-102-9");
  sucursalFuera = (
    await c.query(
      "insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal restringida', 'S009') returning id",
      [esc.empresaId],
    )
  ).rows[0].id as string;

  // Un rol de prueba con permiso de edición pero alcance limitado permite comprobar el 404
  // sin violar la regla de producción que da todas las sucursales a administradores/contadores.
  await c.query("insert into roles (id, codigo, nombre) values (5, 'contador_sucursal_test', 'Contador limitado')");
  await c.query(
    `insert into rol_permisos (rol_id, permiso_id)
     select 5, id from permisos where (modulo, accion) in
       (('partidas', 'editar_contabilizada'), ('partidas', 'ver'))`,
  );

  for (const [id, rol, todas] of [
    [CONTADOR, 2, true],
    [AUXILIAR, 3, false],
    [CONSULTA, 4, false],
    [CONTADOR_LIMITADO, 5, false],
    [CONTADOR_AJENA, 2, true],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [id, id, `${id}@test.sv`]);
    const membresia = await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
      [id, esc.empresaId, rol, todas],
    );
    if (!todas) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        membresia.rows[0].id,
        esc.sucursalId,
      ]);
    }
  }
  await c.query("insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)", [
    CONTADOR_AJENA,
    ajena.empresaId,
  ]);
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

beforeEach(async () => {
  await c.query(
    "update periodos set estado = 'abierto', cerrado_en = null, motivo_reapertura = 'Restablecer escenario de prueba' where empresa_id = $1 and estado = 'cerrado'",
    [esc.empresaId],
  );
});

describe("PUT /empresas/:empresa/partidas/:partida/contabilizada", () => {
  it("actualiza sin cambiar número y conserva cabecera, líneas y usuario de la versión anterior", async () => {
    const original = await crearContabilizada("Antes de corregir");
    const actualizada = await editar(original.id, CONTADOR, datos("Después de corregir"));
    expect(actualizada.status).toBe(200);
    expect(actualizada.cuerpo).toMatchObject({ id: original.id, numero: original.numero, concepto: "Después de corregir" });
    const [partida] = (await c.query("select version, numero from partidas where id = $1", [original.id])).rows;
    expect(partida).toEqual({ version: 2, numero: original.numero });
    const [anterior] = (
      await c.query(
        "select version, datos ->> 'concepto' as concepto, lineas, reemplazada_por from partida_versiones where partida_id = $1",
        [original.id],
      )
    ).rows;
    expect(anterior.version).toBe(1);
    expect(anterior.concepto).toBe("Antes de corregir");
    expect(anterior.lineas).toHaveLength(2);
    expect(anterior.reemplazada_por).toBe(CONTADOR);
    const auditoria = await c.query(
      "select usuario_id from bitacora where empresa_id = $1 and tabla = 'partidas' and registro_id = $2 and accion = 'UPDATE' order by id desc limit 1",
      [esc.empresaId, original.id],
    );
    expect(auditoria.rows[0]?.usuario_id).toBe(CONTADOR);
  });

  it("guarda versiones 1 y 2 en dos ediciones consecutivas", async () => {
    const original = await crearContabilizada();
    expect((await editar(original.id, CONTADOR, datos("Edición 1"))).status).toBe(200);
    expect((await editar(original.id, CONTADOR, datos("Edición 2"))).status).toBe(200);
    const versiones = await c.query(
      "select version from partida_versiones where partida_id = $1 order by version",
      [original.id],
    );
    expect(versiones.rows.map((fila) => fila.version)).toEqual([1, 2]);
    const [actual] = (await c.query("select version, concepto from partidas where id = $1", [original.id])).rows;
    expect(actual).toEqual({ version: 3, concepto: "Edición 2" });
  });

  it("rechaza edición en período cerrado sin crear una versión", async () => {
    const original = await crearContabilizada();
    await c.query("update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 11", [esc.empresaId]);
    const r = await editar(original.id, CONTADOR, datos("No debe guardarse"));
    expect(r.status).toBe(422);
    expect((await c.query("select version, concepto from partidas where id = $1", [original.id])).rows[0]).toMatchObject({
      version: 1,
      concepto: "Original",
    });
    expect((await c.query("select count(*) from partida_versiones where partida_id = $1", [original.id])).rows[0].count).toBe("0");
  });

  it("rechaza partidas en borrador o anuladas con 409", async () => {
    const borrador = await pedir("POST", `/empresas/${esc.empresaId}/partidas`, CONTADOR, datos("Borrador"));
    expect(borrador.status, JSON.stringify(borrador.cuerpo)).toBe(201);
    const respuestaBorrador = await editar(borrador.cuerpo.id, CONTADOR, datos("No"));
    expect(respuestaBorrador.status, JSON.stringify(respuestaBorrador.cuerpo)).toBe(409);
    const original = await crearContabilizada();
    await c.query("update partidas set estado = 'anulada', motivo_anulacion = 'Prueba de estado' where id = $1", [original.id]);
    expect((await editar(original.id, CONTADOR, datos("No"))).status).toBe(409);
  });

  it("deniega roles sin permiso y oculta partidas de sucursales o empresas ajenas", async () => {
    const matriz = await crearContabilizada();
    expect((await editar(matriz.id, AUXILIAR, datos("No"))).status).toBe(403);
    expect((await editar(matriz.id, CONSULTA, datos("No"))).status).toBe(403);
    const fuera = await crearContabilizada("Sucursal restringida", sucursalFuera);
    expect((await editar(fuera.id, CONTADOR_LIMITADO, datos("No"))).status).toBe(404);
    const partidaAjena = await pedir(
      "POST",
      `/empresas/${ajena.empresaId}/partidas`,
      CONTADOR_AJENA,
      datos("Ajena", ajena.sucursalId, "100", ajena),
    );
    expect(partidaAjena.status).toBe(201);
    const contabilizadaAjena = await pedir(
      "POST",
      `/empresas/${ajena.empresaId}/partidas/${partidaAjena.cuerpo.id}/contabilizar`,
      CONTADOR_AJENA,
    );
    expect(contabilizadaAjena.status).toBe(200);
    expect((await editar(contabilizadaAjena.cuerpo.id, CONTADOR, datos("No"))).status).toBe(404);
  });

  it("rechaza descuadre o líneas inválidas sin alterar la partida ni su historial", async () => {
    const original = await crearContabilizada();
    const descuadrada = await editar(original.id, CONTADOR, {
      ...datos("Descuadrada"),
      lineas: [
        { cuentaId: esc.cuentas["110101"], debe: "99" },
        { cuentaId: esc.cuentas["5101"], haber: "100" },
      ],
    });
    expect(descuadrada.status).toBe(422);
    const invalida = await editar(original.id, CONTADOR, {
      ...datos("Cuenta padre"),
      lineas: [{ cuentaId: esc.cuentas["1101"], debe: "100" }, { cuentaId: esc.cuentas["5101"], haber: "100" }],
    });
    expect(invalida.status).toBe(422);
    expect((await c.query("select version, concepto from partidas where id = $1", [original.id])).rows[0]).toMatchObject({
      version: 1,
      concepto: "Original",
    });
    expect((await c.query("select count(*) from partida_versiones where partida_id = $1", [original.id])).rows[0].count).toBe("0");
  });
});
