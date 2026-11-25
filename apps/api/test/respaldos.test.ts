import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const LIMITADO = "22222222-2222-4222-8222-222222222222";
const FORASTERO = "33333333-3333-4333-8333-333333333333";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let sucursalDos: string;
let empleadoUno: string;
let empleadoDos: string;

async function usuario(id: string, empresaId: string, rolId = 1, todasSucursales = true) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${rolId}`,
    `usuario-${id.slice(0, 4)}@respaldos.test`,
  ]);
  const membresia = await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
    [id, empresaId, rolId, todasSucursales],
  );
  return membresia.rows[0]!.id as string;
}

async function empleado(empresaId: string, sucursalId: string, dui: string, nombres: string) {
  const fila = await c.query(
    "insert into empleados (empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, area, salario, fecha_ingreso) " +
      "values ($1, $2, $3, 'Prueba', $4, $5, $6, $7, 'Auxiliar', 'Administración', 450, '2026-01-01') returning id",
    [empresaId, sucursalId, nombres, dui, `${dui}-NIT`, `${dui}-ISSS`, `${dui}-NUP`],
  );
  return fila.rows[0]!.id as string;
}

async function pedir(
  metodo: string,
  ruta: string,
  usuarioId: string,
  cuerpo?: unknown,
  empresaId = esc.empresaId,
) {
  const respuesta = await fetch(`${url}/empresas/${empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${usuarioId}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  let contenido: unknown = texto;
  try {
    contenido = texto ? (JSON.parse(texto) as unknown) : undefined;
  } catch {
    // Los archivos se inspeccionan como texto JSON en la prueba que los descarga.
  }
  return { status: respuesta.status, contenido, cabeceras: respuesta.headers };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_respaldos");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-130101-101-1");
  ajena = await crearEscenario(c, "0614-130102-101-2");
  const sucursal = await c.query(
    "insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Usulután', 'M002') returning id",
    [esc.empresaId],
  );
  sucursalDos = sucursal.rows[0]!.id as string;
  empleadoUno = await empleado(esc.empresaId, esc.sucursalId, "DUI-RESPALDO-01", "Ana");
  empleadoDos = await empleado(esc.empresaId, sucursalDos, "DUI-RESPALDO-02", "Luis");
  const membresiaAdmin = await usuario(ADMIN, esc.empresaId);
  const membresiaLimitado = await usuario(LIMITADO, esc.empresaId, 3, false);
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    membresiaLimitado,
    esc.sucursalId,
  ]);
  await usuario(FORASTERO, ajena.empresaId);
  await c.query(
    "insert into rol_permisos (rol_id, permiso_id) select 1, id from permisos where modulo = 'respaldo' and accion in ('crear', 'restaurar') on conflict do nothing",
  );
  await c.query(
    "insert into rol_permisos (rol_id, permiso_id) select 3, id from permisos where modulo = 'respaldo' and accion = 'crear' on conflict do nothing",
  );
  await c.query("select $1::uuid", [membresiaAdmin]);

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  app = modulo.createNestApplication({ logger: ["error"] });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

process.env["RESPALDO_HMAC_SECRETO"] = "secreto-de-prueba-con-al-menos-32-caracteres";

describe("respaldos por empresa (HU-13, S3-T01 y S3-T03)", () => {
  it("crea y descarga el archivo JSON completo y lista solo metadatos", async () => {
    const creado = await pedir("POST", "/respaldos", ADMIN, {});
    expect(creado.status).toBe(201);
    const datos = creado.contenido as { id: string; tipo: string; sha256: string; nombreArchivo: string };
    expect(datos).toMatchObject({ tipo: "empresa", nombreArchivo: expect.stringMatching(/\.json$/) });
    expect(datos.sha256).toMatch(/^[a-f0-9]{64}$/);

    const archivo = await pedir("GET", `/respaldos/${datos.id}/archivo`, ADMIN);
    expect(archivo.status).toBe(200);
    expect(archivo.cabeceras.get("content-disposition")).toContain(datos.nombreArchivo);
    const contenido = archivo.contenido as {
      contenido: { formato: string; tablas: Record<string, unknown[]> };
      sha256: string;
    };
    expect(contenido.sha256).toBe(datos.sha256);
    expect(contenido.contenido.formato).toBe("contable-respaldo-v1");
    expect(contenido.contenido.tablas["empleados"]).toHaveLength(2);
    expect(contenido.contenido.tablas["bitacora"]).toBeDefined();

    const lista = await pedir("GET", "/respaldos", ADMIN);
    expect(lista.status).toBe(200);
    expect((lista.contenido as Record<string, unknown>[])[0]).toMatchObject({
      id: datos.id,
      tipo: "empresa",
    });
    expect((lista.contenido as Record<string, unknown>[])[0]).not.toHaveProperty("contenido");
  });

  it("exporta únicamente la sucursal elegida y aplica alcance de sucursal al usuario limitado", async () => {
    const creado = await pedir("POST", "/respaldos", ADMIN, { sucursalId: sucursalDos });
    expect(creado.status).toBe(201);
    const datos = creado.contenido as { id: string; tipo: string; sucursalId: string };
    expect(datos).toMatchObject({ tipo: "sucursal", sucursalId: sucursalDos });
    const archivo = await pedir("GET", `/respaldos/${datos.id}/archivo`, ADMIN);
    const snapshot = (
      archivo.contenido as {
        contenido: { tipo: string; sucursalId: string; tablas: Record<string, Record<string, unknown>[]> };
      }
    ).contenido;
    expect(snapshot).toMatchObject({ tipo: "sucursal", sucursalId: sucursalDos });
    expect(snapshot.tablas["empleados"]?.map((fila) => fila["id"])).toEqual([empleadoDos]);

    const completo = await pedir("POST", "/respaldos", ADMIN, {});
    const idCompleto = (completo.contenido as { id: string }).id;

    const propio = await pedir("POST", "/respaldos", LIMITADO, { sucursalId: esc.sucursalId });
    expect(propio.status).toBe(201);
    expect((await pedir("POST", "/respaldos", LIMITADO, {})).status).toBe(403);
    expect((await pedir("POST", "/respaldos", LIMITADO, { sucursalId: sucursalDos })).status).toBe(403);
    const listaLimitada = await pedir("GET", "/respaldos", LIMITADO);
    expect((listaLimitada.contenido as Record<string, unknown>[]).map((fila) => fila["id"])).toEqual([
      (propio.contenido as { id: string }).id,
    ]);
    expect((await pedir("GET", `/respaldos/${idCompleto}/archivo`, LIMITADO)).status).toBe(403);
    expect((await pedir("GET", `/respaldos/${datos.id}/archivo`, LIMITADO)).status).toBe(403);
    // Descargar el archivo exige respaldo.restaurar (solo administrador), aunque el respaldo sea de su sucursal
    expect(
      (await pedir("GET", `/respaldos/${(propio.contenido as { id: string }).id}/archivo`, LIMITADO)).status,
    ).toBe(403);
    expect((await pedir("GET", "/respaldos", ADMIN, undefined, ajena.empresaId)).status).toBe(404);
  });

  it("rechaza sucursales, bloquea una restauración sobre datos y restaura al quedar vacía", async () => {
    const parcial = await pedir("POST", "/respaldos", ADMIN, { sucursalId: sucursalDos });
    const idParcial = (parcial.contenido as { id: string }).id;
    expect(
      (await pedir("POST", `/respaldos/${idParcial}/restaurar`, ADMIN, { confirmacion: "RESTAURAR" })).status,
    ).toBe(422);

    const completo = await pedir("POST", "/respaldos", ADMIN, {});
    const idCompleto = (completo.contenido as { id: string }).id;
    const ocupado = await pedir("POST", `/respaldos/${idCompleto}/restaurar`, ADMIN, {
      confirmacion: "RESTAURAR",
    });
    expect(ocupado.status).toBe(409);
    expect((ocupado.contenido as { message: string }).message).toContain("empresa vacía");

    await c.query("delete from empleados where empresa_id = $1", [esc.empresaId]);
    const restauracion = await pedir("POST", `/respaldos/${idCompleto}/restaurar`, ADMIN, {
      confirmacion: "RESTAURAR",
    });
    expect(restauracion.status, JSON.stringify(restauracion.contenido)).toBe(201);
    expect(restauracion.contenido).toMatchObject({ filasRestauradas: expect.any(Number) });
    const restaurados = await c.query(
      "select id, nombres, sucursal_id from empleados where empresa_id = $1 order by dui",
      [esc.empresaId],
    );
    expect(restaurados.rows).toEqual([
      { id: empleadoUno, nombres: "Ana", sucursal_id: esc.sucursalId },
      { id: empleadoDos, nombres: "Luis", sucursal_id: sucursalDos },
    ]);
    const evento = await c.query(
      "select usuario_id, accion from bitacora where tabla = 'respaldos' and registro_id = $1 and accion = 'RESTAURAR'",
      [idCompleto],
    );
    expect(evento.rows).toEqual([{ usuario_id: ADMIN, accion: "RESTAURAR" }]);
  });
});

describe("seguridad de los respaldos (revisión de seguridad S3)", () => {
  it("solo quien puede restaurar descarga el archivo, y cada descarga queda en la bitácora", async () => {
    const propio = await pedir("POST", "/respaldos", LIMITADO, { sucursalId: esc.sucursalId });
    expect(propio.status).toBe(201);
    const id = (propio.contenido as { id: string }).id;
    expect((await pedir("GET", `/respaldos/${id}/archivo`, LIMITADO)).status).toBe(403);

    const completo = (await pedir("POST", "/respaldos", ADMIN, {})).contenido as { id: string };
    expect((await pedir("GET", `/respaldos/${completo.id}/archivo`, ADMIN)).status).toBe(200);
    const evento = await c.query(
      "select usuario_id, accion from bitacora where tabla = 'respaldos' and registro_id = $1 and accion = 'DESCARGAR'",
      [completo.id],
    );
    expect(evento.rows).toEqual([{ usuario_id: ADMIN, accion: "DESCARGAR" }]);
  });

  it("la huella es un HMAC: cambia con el secreto del servidor", async () => {
    const creado = (await pedir("POST", "/respaldos", ADMIN, {})).contenido as { id: string; sha256: string };
    const anterior = process.env["RESPALDO_HMAC_SECRETO"];
    process.env["RESPALDO_HMAC_SECRETO"] = "otro-secreto-distinto-de-al-menos-32-caracteres";
    try {
      // Con otro secreto la huella guardada deja de ser válida: el archivo se considera dañado
      expect((await pedir("GET", `/respaldos/${creado.id}/archivo`, ADMIN)).status).toBe(422);
    } finally {
      process.env["RESPALDO_HMAC_SECRETO"] = anterior;
    }
    expect((await pedir("GET", `/respaldos/${creado.id}/archivo`, ADMIN)).status).toBe(200);
  });

  it("sin el secreto configurado el servicio responde 503 y no crea respaldos", async () => {
    const anterior = process.env["RESPALDO_HMAC_SECRETO"];
    delete process.env["RESPALDO_HMAC_SECRETO"];
    try {
      expect((await pedir("POST", "/respaldos", ADMIN, {})).status).toBe(503);
    } finally {
      process.env["RESPALDO_HMAC_SECRETO"] = anterior;
    }
  });
});

describe("respaldos con las tablas de los módulos posteriores (Fase 2)", () => {
  let e2: Escenario;
  let plantillaId: string;

  beforeAll(async () => {
    e2 = await crearEscenario(c, "0614-730101-101-3");
    await c.query(
      `insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 1, true)`,
      [ADMIN, e2.empresaId],
    );
    plantillaId = (
      await c.query(
        `insert into plantillas_recurrentes (empresa_id, sucursal_id, nombre, concepto) values ($1, $2, 'Alquiler', 'Pago') returning id::text`,
        [e2.empresaId, e2.sucursalId],
      )
    ).rows[0].id as string;
    await c.query(
      `insert into plantilla_recurrente_lineas (empresa_id, plantilla_id, cuenta_id, debe, haber, orden) values ($1, $2, $3, 10, 0, 0), ($1, $2, $4, 0, 10, 1)`,
      [e2.empresaId, plantillaId, e2.cuentas["5101"], e2.cuentas["110101"]],
    );
  });

  it("el respaldo de la empresa incluye plantillas recurrentes, su configuración de ISR y las tablas vacías como listas", async () => {
    const creado = (await pedir("POST", "/respaldos", ADMIN, {}, e2.empresaId)).contenido as { id: string };
    const archivo = (await pedir("GET", `/respaldos/${creado.id}/archivo`, ADMIN, undefined, e2.empresaId))
      .contenido as { contenido: { tablas: Record<string, Record<string, unknown>[]> } };
    const t = archivo.contenido.tablas;
    expect(t["plantillas_recurrentes"]).toHaveLength(1);
    expect(t["plantilla_recurrente_lineas"]).toHaveLength(2);
    expect(t["plantillas_recurrentes"]![0]).toMatchObject({ id: plantillaId, nombre: "Alquiler" });
    for (const tabla of [
      "cajas_chicas",
      "vales_caja_chica",
      "movimientos_bancarios",
      "series_inventario",
      "tomas_fisicas",
    ]) {
      expect(t[tabla], tabla).toEqual([]);
    }
  });

  it("el respaldo de una sucursal incluye sus plantillas y omite lo que es de toda la empresa", async () => {
    const creado = (await pedir("POST", "/respaldos", ADMIN, { sucursalId: e2.sucursalId }, e2.empresaId))
      .contenido as { id: string };
    const archivo = (await pedir("GET", `/respaldos/${creado.id}/archivo`, ADMIN, undefined, e2.empresaId))
      .contenido as { contenido: { tablas: Record<string, unknown[]> } };
    expect(archivo.contenido.tablas["plantillas_recurrentes"]).toHaveLength(1);
    expect(archivo.contenido.tablas["configuraciones_isr"]).toEqual([]);
  });

  it("la restauración se niega mientras la empresa tenga plantillas y las recupera al vaciarla", async () => {
    const creado = (await pedir("POST", "/respaldos", ADMIN, {}, e2.empresaId)).contenido as { id: string };
    const ocupado = await pedir(
      "POST",
      `/respaldos/${creado.id}/restaurar`,
      ADMIN,
      { confirmacion: "RESTAURAR" },
      e2.empresaId,
    );
    expect(ocupado.status).toBe(409);
    await c.query(`alter table plantilla_recurrente_lineas disable trigger user`);
    await c.query(`delete from plantilla_recurrente_lineas where empresa_id = $1`, [e2.empresaId]);
    await c.query(`alter table plantilla_recurrente_lineas enable trigger user`);
    await c.query(`delete from plantillas_recurrentes where empresa_id = $1`, [e2.empresaId]);
    const ok = await pedir(
      "POST",
      `/respaldos/${creado.id}/restaurar`,
      ADMIN,
      { confirmacion: "RESTAURAR" },
      e2.empresaId,
    );
    expect(ok.status, JSON.stringify(ok.contenido)).toBe(201);
    const filas = await c.query(
      `select (select count(*)::int from plantillas_recurrentes where empresa_id = $1) as plantillas,
              (select count(*)::int from plantilla_recurrente_lineas where empresa_id = $1) as lineas`,
      [e2.empresaId],
    );
    expect(filas.rows[0]).toEqual({ plantillas: 1, lineas: 2 });
  });
});
