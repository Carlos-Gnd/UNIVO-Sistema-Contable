// Recuperación ante desastre de un respaldo con tablas inmutables (HU-13, S3-T01): caja chica, conciliación
// bancaria, series y tomas físicas nunca dejan vacía una empresa, así que solo se restauran en una base nueva.
// Origen y destino son bases distintas: el archivo descargado del origen se carga en el destino limpio.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
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

process.env["RESPALDO_HMAC_SECRETO"] = "secreto-de-prueba-con-al-menos-32-caracteres";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const TABLAS_INMUTABLES = [
  "cajas_chicas",
  "vales_caja_chica",
  "movimientos_bancarios",
  "conciliaciones_bancarias",
  "detalles_conciliacion_bancaria",
  "lineas_estado_cuenta",
  "series_inventario",
  "tomas_fisicas",
  "tomas_fisicas_detalles",
] as const;

type Cliente = Awaited<ReturnType<typeof reiniciarBase>>;

interface Sistema {
  c: Cliente;
  app: INestApplication;
  url: string;
}

let origen: Sistema;
let destino: Sistema;
let esc: Escenario;
let archivo: { contenido: unknown; sha256: string; nombre: string };

const cuenta = async (c: Cliente, codigo: string, nombre: string, tipo = "activo") =>
  (
    await c.query(
      `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, 'deudora', $4) returning id`,
      [esc.empresaId, codigo, nombre, tipo],
    )
  ).rows[0]!.id as string;

async function levantar(nombre: string): Promise<Sistema> {
  const urlBase = await basePropia(nombre);
  const c = await reiniciarBase(urlBase);
  return { c, app: undefined as never, url: urlBase };
}

async function iniciarApi(sistema: Sistema): Promise<void> {
  process.env["DATABASE_URL"] = sistema.url;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  sistema.app = modulo.createNestApplication({ logger: ["error"] });
  await sistema.app.listen(0, "127.0.0.1");
  const direccion = await sistema.app.getUrl();
  // La URL de conexión ya no se necesita; se reutiliza el campo para la dirección HTTP.
  sistema.url = direccion;
}

async function pedir(sistema: Sistema, metodo: string, ruta: string, cuerpo?: unknown) {
  const respuesta = await fetch(`${sistema.url}/empresas/${esc.empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return {
    status: respuesta.status,
    texto,
    json: texto ? (JSON.parse(texto) as Record<string, unknown>) : {},
  };
}

async function permisosAdmin(c: Cliente, empresaId: string) {
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Administrador', 'admin@recuperacion.test')",
    [ADMIN],
  );
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 1, true)",
    [ADMIN, empresaId],
  );
  await c.query(
    "insert into rol_permisos (rol_id, permiso_id) select 1, id from permisos where modulo = 'respaldo' and accion in ('crear', 'restaurar') on conflict do nothing",
  );
}

/** Carga datos en todas las tablas inmutables de la empresa de origen. */
async function sembrarInmutables(c: Cliente) {
  // Caja chica con apertura y vale
  await cuenta(c, "110102", "Caja chica");
  const cuentaCajaChica = await cuenta(c, "11010201", "Caja chica matriz");
  const tesoreriaCaja = (
    await c.query(
      `insert into cuentas_tesoreria (empresa_id, sucursal_id, cuenta_id, tipo, nombre) values ($1, $2, $3, 'caja', 'Caja chica matriz') returning id`,
      [esc.empresaId, esc.sucursalId, cuentaCajaChica],
    )
  ).rows[0]!.id as string;
  const cajaChicaId = randomUUID();
  const apertura = await crearPartida(
    c,
    esc,
    "2026-10-01",
    [
      [cuentaCajaChica, "200.00", "0.00"],
      [esc.cuentas["110101"]!, "0.00", "200.00"],
    ],
    "operacion",
    { origen: "caja_chica_apertura", origenId: cajaChicaId },
  );
  await c.query(
    `insert into cajas_chicas (id, empresa_id, sucursal_id, cuenta_tesoreria_id, fondo_fijo, partida_apertura_id)
     values ($1, $2, $3, $4, 200, $5)`,
    [cajaChicaId, esc.empresaId, esc.sucursalId, tesoreriaCaja, apertura],
  );
  await cuenta(c, "52", "Costos y gastos", "costos_gastos");
  const cuentaGasto = await cuenta(c, "5201", "Gastos generales", "costos_gastos");
  await c.query(
    `insert into vales_caja_chica (empresa_id, caja_chica_id, fecha, comprobante, concepto, monto_neto, cuenta_gasto_id)
     values ($1, $2, '2026-10-03', 'V-001', 'Papelería', 25, $3)`,
    [esc.empresaId, cajaChicaId, cuentaGasto],
  );

  // Banco, cheque y conciliación con una línea del estado de cuenta
  const cuentaBanco = await cuenta(c, "110103", "Bancos");
  const bancoId = (
    await c.query(
      `insert into cuentas_tesoreria (empresa_id, sucursal_id, cuenta_id, tipo, nombre, banco, numero_cuenta)
       values ($1, $2, $3, 'banco', 'Banco de prueba', 'Banco', '000111222') returning id`,
      [esc.empresaId, esc.sucursalId, cuentaBanco],
    )
  ).rows[0]!.id as string;
  const movimientoId = randomUUID();
  const partidaCheque = await crearPartida(
    c,
    esc,
    "2026-10-05",
    [
      [esc.cuentas["5101"]!, "226.00", "0.00"],
      [cuentaBanco, "0.00", "226.00"],
    ],
    "operacion",
    { origen: "movimiento_bancario", origenId: movimientoId },
  );
  await c.query(
    `insert into movimientos_bancarios
       (id, empresa_id, cuenta_tesoreria_id, sucursal_id, cuenta_contrapartida_id, tipo, fecha,
        referencia, comprobante, concepto, monto, estado_cheque, partida_id)
     values ($1, $2, $3, $4, $5, 'cheque'::tipo_movimiento_bancario, '2026-10-05', 'CH-0001', 'F-0001',
             'Pago de prueba', 226, 'emitido'::estado_cheque_bancario, $6)`,
    [movimientoId, esc.empresaId, bancoId, esc.sucursalId, esc.cuentas["5101"]!, partidaCheque],
  );
  const partidaDeposito = await crearPartida(c, esc, "2026-10-12", [
    [cuentaBanco, "100.00", "0.00"],
    [esc.cuentas["5101"]!, "0.00", "100.00"],
  ]);
  await contabilizar(c, partidaDeposito);
  const lineaBanco = (
    await c.query("select id from partida_detalles where partida_id = $1 and cuenta_id = $2", [
      partidaDeposito,
      cuentaBanco,
    ])
  ).rows[0]!.id as string;
  const conciliacionId = (
    await c.query(
      `insert into conciliaciones_bancarias (empresa_id, cuenta_tesoreria_id, fecha_corte, saldo_estado, creado_por)
       values ($1, $2, '2026-10-31', 100, $3) returning id`,
      [esc.empresaId, bancoId, ADMIN],
    )
  ).rows[0]!.id as string;
  await c.query(
    "insert into detalles_conciliacion_bancaria (empresa_id, conciliacion_id, partida_detalle_id) values ($1, $2, $3)",
    [esc.empresaId, conciliacionId, lineaBanco],
  );
  await c.query(
    `insert into lineas_estado_cuenta (empresa_id, conciliacion_id, numero_fila, fecha, referencia, descripcion, monto, huella)
     values ($1, $2, 2, '2026-10-12', 'REF-100', 'Depósito', 100, $3)`,
    [esc.empresaId, conciliacionId, "b".repeat(64)],
  );

  // Producto con series: una entrada de dos unidades y la salida de una
  const productoId = (
    await c.query(
      "insert into productos (empresa_id, codigo, nombre, controla_series) values ($1, 'CEL-1', 'Teléfono', true) returning id",
      [esc.empresaId],
    )
  ).rows[0]!.id as string;
  // La entrada y sus series deben registrarse en la misma transacción (regla diferida de la base)
  await c.query("begin");
  const entrada = (
    await c.query(
      `insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total)
       values ($1, $2, $3, '2026-10-01', 'entrada', 2, 590, 1180) returning id`,
      [esc.empresaId, esc.sucursalId, productoId],
    )
  ).rows[0]!.id as string;
  for (const numero of ["IMEI-A", "IMEI-B"]) {
    await c.query(
      `insert into series_inventario (empresa_id, sucursal_id, producto_id, numero_serie, costo_unitario, movimiento_entrada_id)
       values ($1, $2, $3, $4, 590, $5)`,
      [esc.empresaId, esc.sucursalId, productoId, numero, entrada],
    );
  }
  const salida = (
    await c.query(
      `insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total)
       values ($1, $2, $3, '2026-10-02', 'salida', 1, 590, 590) returning id`,
      [esc.empresaId, esc.sucursalId, productoId],
    )
  ).rows[0]!.id as string;
  await c.query(
    "update series_inventario set movimiento_salida_id = $1 where empresa_id = $2 and numero_serie = 'IMEI-A'",
    [salida, esc.empresaId],
  );

  await c.query("commit");

  // Toma física con un renglón
  const tomaId = (
    await c.query(
      "insert into tomas_fisicas (empresa_id, sucursal_id, fecha, creado_por) values ($1, $2, '2026-10-31', $3) returning id",
      [esc.empresaId, esc.sucursalId, ADMIN],
    )
  ).rows[0]!.id as string;
  await c.query(
    "insert into tomas_fisicas_detalles (empresa_id, toma_fisica_id, producto_id, existencia_sistema, secuencia_sistema) values ($1, $2, $3, 1, 0)",
    [esc.empresaId, tomaId, productoId],
  );
}

const conteos = async (c: Cliente) => {
  const filas: Record<string, number> = {};
  for (const tabla of [
    ...TABLAS_INMUTABLES,
    "partidas",
    "partida_detalles",
    "movimientos_inventario",
    "cuentas",
  ]) {
    filas[tabla] = (
      await c.query(`select count(*)::int n from ${tabla} where empresa_id = $1`, [esc.empresaId])
    ).rows[0].n as number;
  }
  return filas;
};

beforeAll(async () => {
  origen = await levantar("contable_api_recuperacion_origen");
  destino = await levantar("contable_api_recuperacion_destino");
  esc = await crearEscenario(origen.c, "0614-130201-101-1");
  await permisosAdmin(origen.c, esc.empresaId);
  await sembrarInmutables(origen.c);
  await iniciarApi(origen);
}, 120_000);

afterAll(async () => {
  await origen?.app?.close();
  await destino?.app?.close();
  await origen?.c?.end();
  await destino?.c?.end();
});

describe("recuperación de un respaldo con tablas inmutables en una base nueva (HU-13)", () => {
  it("la empresa de origen nunca queda vacía: la restauración in situ se niega", async () => {
    const creado = await pedir(origen, "POST", "/respaldos", {});
    expect(creado.status, creado.texto).toBe(201);
    const id = creado.json["id"] as string;
    const descarga = await fetch(`${origen.url}/empresas/${esc.empresaId}/respaldos/${id}/archivo`, {
      headers: { authorization: `Bearer ${ADMIN}` },
    });
    expect(descarga.status).toBe(200);
    // El archivo descargado trae el contenido y su huella HMAC
    const descargado = (await descarga.json()) as { contenido: unknown; sha256: string };
    archivo = {
      contenido: descargado.contenido,
      sha256: descargado.sha256,
      nombre:
        /filename="([^"]+)"/.exec(descarga.headers.get("content-disposition") ?? "")?.[1] ?? "respaldo.json",
    };
    const intento = await pedir(origen, "POST", `/respaldos/${id}/restaurar`, { confirmacion: "RESTAURAR" });
    expect(intento.status).toBe(409);
  });

  it("el archivo incluye todas las tablas inmutables con sus filas", () => {
    const tablas = (archivo.contenido as { tablas: Record<string, unknown[]> }).tablas;
    for (const tabla of TABLAS_INMUTABLES) {
      expect(tablas[tabla]?.length, tabla).toBeGreaterThan(0);
    }
  });

  it("se restaura completo en una base limpia y conserva cada tabla inmutable", async () => {
    const respaldo = archivo.contenido as { empresa: Record<string, unknown> };
    const empresa = respaldo.empresa;
    // Operador: crea la empresa vacía con el mismo id, un administrador y el archivo en la tabla de respaldos
    await destino.c.query(
      `insert into empresas (id, nombre, nit, tipo_contribuyente, modo_numeracion) values ($1, $2, $3, 'persona_natural', $4)`,
      [empresa["id"], empresa["nombre"], empresa["nit"], empresa["modo_numeracion"]],
    );
    await permisosAdmin(destino.c, esc.empresaId);
    const idRespaldo = randomUUID();
    // La tabla exige que el usuario de la sesión sea quien lo crea (app.usuario_id)
    await destino.c.query("begin");
    await destino.c.query("select set_config('app.usuario_id', $1, true)", [ADMIN]);
    await destino.c.query(
      `insert into respaldos (id, empresa_id, tipo, nombre_archivo, contenido, sha256, creado_por, creado_en)
       values ($1, $2, 'empresa', $3, $4::jsonb, $5, $6, $7)`,
      [
        idRespaldo,
        esc.empresaId,
        archivo.nombre,
        JSON.stringify(archivo.contenido),
        archivo.sha256,
        ADMIN,
        (archivo.contenido as { generadoEn: string }).generadoEn,
      ],
    );
    await destino.c.query("commit");
    await iniciarApi(destino);

    const r = await pedir(destino, "POST", `/respaldos/${idRespaldo}/restaurar`, {
      confirmacion: "RESTAURAR",
    });
    expect(r.status, r.texto).toBe(201);

    expect(await conteos(destino.c)).toEqual(await conteos(origen.c));
    // Las series conservan estado y costo; la vendida sigue ligada a su salida
    const series = await destino.c.query(
      "select numero_serie, costo_unitario::text, movimiento_salida_id is not null as vendida from series_inventario where empresa_id = $1 order by numero_serie",
      [esc.empresaId],
    );
    expect(series.rows).toEqual([
      { numero_serie: "IMEI-A", costo_unitario: "590.00", vendida: true },
      { numero_serie: "IMEI-B", costo_unitario: "590.00", vendida: false },
    ]);
    const huella = await destino.c.query("select huella from lineas_estado_cuenta where empresa_id = $1", [
      esc.empresaId,
    ]);
    expect(huella.rows).toEqual([{ huella: "b".repeat(64) }]);
  });

  it("las reglas de inmutabilidad siguen vigentes en la base restaurada", async () => {
    await expect(
      destino.c.query("delete from vales_caja_chica where empresa_id = $1", [esc.empresaId]),
    ).rejects.toThrow();
    await expect(destino.c.query("truncate lineas_estado_cuenta")).rejects.toThrow();
  });
});
