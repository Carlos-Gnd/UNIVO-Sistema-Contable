// Movimientos, conciliación de octubre e importación CSV (HU-78 a HU-80).
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ConciliacionBancariaVista,
  MovimientoBancarioVista,
  ResultadoImportacionEstadoCuenta,
} from "@contable/shared";
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
const SIN_MEMBRESIA = "22222222-2222-4222-8222-222222222222";
const LIMITADO = "33333333-3333-4333-8333-333333333333";
let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let otra: Escenario;
let sucursalOtra: string;
let cuentaBanco: string;
let cuentaBancoOtra: string;
let cuentaProveedor: string;
let cuentaTesoreriaId: string;
let cuentaTesoreriaOtra: string;

async function agregarCuenta(empresa: Escenario, codigo: string, nombre: string) {
  const r = await c.query(
    "insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, 'deudora', 'activo') returning id",
    [empresa.empresaId, codigo, nombre],
  );
  return r.rows[0]!.id as string;
}

async function agregarBanco(empresa: Escenario, sucursalId: string, cuentaId: string, nombre: string) {
  const r = await c.query(
    `insert into cuentas_tesoreria (empresa_id, sucursal_id, cuenta_id, tipo, nombre, banco, numero_cuenta)
     values ($1, $2, $3, 'banco', $4, 'Banco de prueba', $5) returning id`,
    [empresa.empresaId, sucursalId, cuentaId, nombre, `CTA-${nombre}-${Date.now()}`],
  );
  return r.rows[0]!.id as string;
}

async function agregarUsuario(id: string, empresa: Escenario, sucursales: string[] | null = null, rolId = 2) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, 'Contador de prueba', $2)", [
    id,
    `${id.slice(0, 8)}@tesoreria.test`,
  ]);
  const membresia = await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
    [id, empresa.empresaId, rolId, sucursales === null],
  );
  if (sucursales !== null) {
    for (const sucursalId of sucursales) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        membresia.rows[0]!.id,
        sucursalId,
      ]);
    }
  }
  return membresia.rows[0]!.id as string;
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
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

async function pedirArchivo(ruta: string, usuarioId: string, contenido: string) {
  const formulario = new FormData();
  formulario.append("archivo", new Blob([contenido], { type: "text/csv" }), "estado.csv");
  const respuesta = await fetch(`${url}/empresas/${esc.empresaId}${ruta}`, {
    method: "POST",
    headers: { authorization: `Bearer ${usuarioId}` },
    body: formulario,
  });
  return {
    status: respuesta.status,
    cuerpo: (await respuesta.json()) as ResultadoImportacionEstadoCuenta[] | Record<string, unknown>,
  };
}

async function crearMovimiento(tipo: string, referencia: string, monto: string, fecha: string) {
  const respuesta = await pedir("POST", "/movimientos-bancarios", CONTADOR, {
    cuentaTesoreriaId,
    sucursalId: esc.sucursalId,
    cuentaContrapartidaId: cuentaProveedor,
    tipo,
    fecha,
    referencia,
    comprobante: `F-${referencia}`,
    beneficiario: "Proveedor de prueba",
    concepto: "Movimiento para conciliación",
    monto,
  });
  return respuesta;
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_tesoreria_bancaria");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-790101-101-1");
  otra = await crearEscenario(c, "0614-790102-101-2");
  sucursalOtra = (
    await c.query(
      "insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal norte', 'N002') returning id",
      [esc.empresaId],
    )
  ).rows[0]!.id as string;
  await agregarCuenta(esc, "110104", "Bancos");
  cuentaBanco = await agregarCuenta(esc, "11010401", "Banco de prueba");
  cuentaBancoOtra = await agregarCuenta(esc, "11010402", "Banco alterno");
  await agregarCuenta(esc, "2", "Pasivo");
  await agregarCuenta(esc, "21", "Pasivo corriente");
  await agregarCuenta(esc, "2101", "Cuentas por pagar");
  cuentaProveedor = await agregarCuenta(esc, "210101", "Proveedores");
  cuentaTesoreriaId = await agregarBanco(esc, esc.sucursalId, cuentaBanco, "Cuenta principal");
  cuentaTesoreriaOtra = await agregarBanco(esc, sucursalOtra, cuentaBancoOtra, "Cuenta norte");
  await agregarBanco(otra, otra.sucursalId, otra.cuentas["110101"]!, "Cuenta ajena");
  await agregarUsuario(CONTADOR, esc);
  await agregarUsuario(SIN_MEMBRESIA, otra);
  await agregarUsuario(LIMITADO, esc, [sucursalOtra], 3);
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

describe("tesorería bancaria", () => {
  it("registra movimientos con partida borrador, detecta referencias duplicadas y cambia el estado del cheque", async () => {
    const datos = {
      cuentaTesoreriaId,
      sucursalId: esc.sucursalId,
      cuentaContrapartidaId: cuentaProveedor,
      tipo: "cheque",
      fecha: "2026-10-05",
      referencia: "CH-001",
      comprobante: "F-001",
      beneficiario: "Proveedor Uno",
      concepto: "Pago de servicios",
      monto: "226.00",
    };
    const creado = await pedir("POST", "/movimientos-bancarios", CONTADOR, datos);
    expect(creado.status).toBe(201);
    const movimiento = creado.cuerpo as unknown as MovimientoBancarioVista;
    expect(movimiento).toMatchObject({
      tipo: "cheque",
      estadoCheque: "emitido",
      monto: "226.00",
      partidaEstado: "borrador",
    });
    const bitacoraMovimiento = await c.query(
      "select distinct usuario_id::text from bitacora where empresa_id = $1 and tabla = 'movimientos_bancarios' and registro_id = $2",
      [esc.empresaId, movimiento.id],
    );
    expect(bitacoraMovimiento.rows.map((fila) => fila.usuario_id)).toContain(CONTADOR);
    expect((await pedir("POST", "/movimientos-bancarios", CONTADOR, datos)).status).toBe(409);
    expect(
      (
        await pedir("POST", "/movimientos-bancarios", CONTADOR, {
          ...datos,
          referencia: "CH-002",
          monto: "0",
        })
      ).status,
    ).toBe(400);
    const partida = await c.query(
      "select p.estado::text, sum(d.debe)::text debe, sum(d.haber)::text haber from partidas p join partida_detalles d on d.partida_id = p.id where p.id = $1 group by p.id",
      [movimiento.partidaId],
    );
    expect(partida.rows[0]).toMatchObject({ estado: "borrador", debe: "226.00", haber: "226.00" });

    const cobrado = await pedir("PATCH", `/movimientos-bancarios/${movimiento.id}/estado-cheque`, CONTADOR, {
      estado: "cobrado",
      fecha: "2026-10-06",
    });
    expect((cobrado.cuerpo as unknown as MovimientoBancarioVista).estadoCheque).toBe("cobrado");
    expect(
      (
        await pedir("PATCH", `/movimientos-bancarios/${movimiento.id}/estado-cheque`, CONTADOR, {
          estado: "anulado",
          fecha: "2026-10-07",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await pedir(
          "GET",
          `/movimientos-bancarios?cuentaTesoreriaId=${cuentaTesoreriaId}&desde=2026-10-01&hasta=2026-10-31`,
          CONTADOR,
        )
      ).status,
    ).toBe(200);
    expect((await pedir("POST", "/movimientos-bancarios", SIN_MEMBRESIA, datos, esc.empresaId)).status).toBe(
      404,
    );
  });

  it("cuadra la conciliación de octubre con las cifras del mockup", async () => {
    const apertura = await crearPartida(c, esc, "2026-10-01", [
      [cuentaBanco, "16655.59", "0.00"],
      [cuentaProveedor, "0.00", "16655.59"],
    ]);
    const deposito = await crearPartida(c, esc, "2026-10-15", [
      [cuentaBanco, "5641.30", "0.00"],
      [cuentaProveedor, "0.00", "5641.30"],
    ]);
    const cheque = await crearPartida(c, esc, "2026-10-20", [
      [cuentaProveedor, "226.00", "0.00"],
      [cuentaBanco, "0.00", "226.00"],
    ]);
    await contabilizar(c, apertura);
    await contabilizar(c, deposito);
    await contabilizar(c, cheque);
    const detalleApertura = (
      await c.query("select id from partida_detalles where partida_id = $1 and cuenta_id = $2", [
        apertura,
        cuentaBanco,
      ])
    ).rows[0]!.id as string;
    const creado = await pedir("POST", "/conciliaciones-bancarias", CONTADOR, {
      cuentaTesoreriaId,
      fechaCorte: "2026-10-31",
      saldoEstado: "16655.59",
    });
    expect(creado.status).toBe(201);
    const corte = creado.cuerpo as unknown as ConciliacionBancariaVista;
    expect(corte).toMatchObject({
      saldoEstado: "16655.59",
      depositosEnTransito: "22296.89",
      chequesEnCirculacion: "226.00",
      saldoLibros: "22070.89",
      diferencia: "16655.59",
    });
    const actualizado = await pedir("PATCH", `/conciliaciones-bancarias/${corte.id}/marcas`, CONTADOR, {
      partidaDetalleId: detalleApertura,
      conciliado: true,
    });
    expect(actualizado.status).toBe(200);
    expect(actualizado.cuerpo).toMatchObject({
      saldoEstado: "16655.59",
      depositosEnTransito: "5641.30",
      chequesEnCirculacion: "226.00",
      saldoLibros: "22070.89",
      diferencia: "0.00",
    });
    const bitacoraMarca = await c.query(
      "select distinct usuario_id::text from bitacora where empresa_id = $1 and tabla = 'detalles_conciliacion_bancaria' and registro_id = (select id::text from detalles_conciliacion_bancaria where conciliacion_id = $2 and partida_detalle_id = $3)",
      [esc.empresaId, corte.id, detalleApertura],
    );
    expect(bitacoraMarca.rows.map((fila) => fila.usuario_id)).toContain(CONTADOR);
    expect(
      (
        await pedir("POST", "/conciliaciones-bancarias", CONTADOR, {
          cuentaTesoreriaId: cuentaTesoreriaOtra,
          fechaCorte: "2026-10-31",
          saldoEstado: "0.00",
        })
      ).status,
    ).toBe(201);
    const accesoRestringido = await pedir(
      "POST",
      "/conciliaciones-bancarias",
      SIN_MEMBRESIA,
      {
        cuentaTesoreriaId,
        fechaCorte: "2026-10-30",
        saldoEstado: "0.00",
      },
      esc.empresaId,
    );
    expect(accesoRestringido.status).toBe(404);
  });

  it("limita las conciliaciones a las sucursales asignadas", async () => {
    const datosMovimiento = {
      cuentaTesoreriaId: cuentaTesoreriaOtra,
      sucursalId: sucursalOtra,
      cuentaContrapartidaId: cuentaProveedor,
      tipo: "remesa",
      fecha: "2026-10-30",
      referencia: "LIM-001",
      comprobante: "F-LIM-001",
      concepto: "Remesa de sucursal",
      monto: "10.00",
    };
    const permitida = await pedir("POST", "/movimientos-bancarios", LIMITADO, datosMovimiento);
    expect(permitida.status).toBe(201);
    const prohibida = await pedir("POST", "/movimientos-bancarios", LIMITADO, {
      ...datosMovimiento,
      cuentaTesoreriaId: cuentaTesoreriaOtra,
      sucursalId: esc.sucursalId,
      referencia: "LIM-002",
    });
    expect(prohibida.status).toBe(403);
  });

  it("previsualiza errores y coincidencias del CSV, importa una sola vez y marca el movimiento", async () => {
    const creada = await crearMovimiento("remesa", "CSV-75", "75.00", "2026-10-20");
    expect(creada.status).toBe(201);
    const movimiento = creada.cuerpo as unknown as MovimientoBancarioVista;
    await c.query("update partidas set estado = 'contabilizada' where id = $1", [movimiento.partidaId]);
    const corte = await pedir("POST", "/conciliaciones-bancarias", CONTADOR, {
      cuentaTesoreriaId,
      fechaCorte: "2026-10-30",
      saldoEstado: "75.00",
    });
    const conciliacion = corte.cuerpo as unknown as ConciliacionBancariaVista;
    const csv =
      "fecha;referencia;descripcion;monto\n2026-10-20;CSV-75;Depósito exacto;75.00\n2026-10-21;SIN-MATCH;Revisar;12.00\nfecha-mala;X;Fila inválida;4.00";
    const previsualizacion = await pedirArchivo(
      `/conciliaciones-bancarias/${conciliacion.id}/estado-cuenta/validar`,
      CONTADOR,
      csv,
    );
    expect(previsualizacion.status).toBe(201);
    expect(previsualizacion.cuerpo).toMatchObject([
      { numeroFila: 2, estado: "coincide", partidaDetalleId: expect.any(String) },
      { numeroFila: 3, estado: "revision", partidaDetalleId: null },
      { numeroFila: 4, estado: "error" },
    ]);
    const importacion = await pedirArchivo(
      `/conciliaciones-bancarias/${conciliacion.id}/estado-cuenta/importar`,
      CONTADOR,
      csv,
    );
    expect(importacion.cuerpo).toMatchObject([
      { numeroFila: 2, estado: "coincide" },
      { numeroFila: 3, estado: "revision" },
      { numeroFila: 4, estado: "error" },
    ]);
    const duplicado = await pedirArchivo(
      `/conciliaciones-bancarias/${conciliacion.id}/estado-cuenta/importar`,
      CONTADOR,
      csv,
    );
    expect(duplicado.cuerpo).toMatchObject([
      { numeroFila: 2, estado: "duplicada" },
      { numeroFila: 3, estado: "duplicada" },
      { numeroFila: 4, estado: "error" },
    ]);
    const detalle = await pedir("GET", `/conciliaciones-bancarias/${conciliacion.id}`, CONTADOR);
    expect(
      (detalle.cuerpo as unknown as ConciliacionBancariaVista).lineas.find(
        (linea) => linea.referencia === "CSV-75",
      )?.conciliado,
    ).toBe(true);
  });
});
