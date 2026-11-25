// Caja chica y reintegros con partidas en borrador (HU-77, S3-T115 y S3-T117).
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CajaChicaVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let sucursalExtra: string;
let cuentaPetty: string;
let cuentaPettyExtra: string;
let cuentaPettyAlterna: string;
let cuentaOrigen: string;
let cuentaOrigenExtra: string;
let cuentaGasto: string;
let cuentaIva: string;
let tesoreriaPetty: string;
let tesoreriaPettyExtra: string;
let tesoreriaPettyAlterna: string;
let tesoreriaOrigen: string;
let tesoreriaOrigenExtra: string;
let cajaMatriz: CajaChicaVista;
let cajaExtra: CajaChicaVista;

async function agregarCuenta(empresa: Escenario, codigo: string, nombre: string, tipo = "activo") {
  const resultado = await c.query(
    `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, 'deudora', $4) returning id`,
    [empresa.empresaId, codigo, nombre, tipo],
  );
  return resultado.rows[0]!.id as string;
}

async function agregarTesoreria(
  empresa: Escenario,
  sucursalId: string,
  cuentaId: string,
  nombre: string,
  numero = "",
) {
  const esBanco = numero !== "";
  const resultado = await c.query(
    `insert into cuentas_tesoreria (empresa_id, sucursal_id, cuenta_id, tipo, nombre, banco, numero_cuenta)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      empresa.empresaId,
      sucursalId,
      cuentaId,
      esBanco ? "banco" : "caja",
      nombre,
      esBanco ? "Banco Agrícola" : null,
      esBanco ? numero : null,
    ],
  );
  return resultado.rows[0]!.id as string;
}

async function usuario(
  id: string,
  rol: number,
  empresa: Escenario,
  sucursales: string[] = [empresa.sucursalId],
) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${rol}`,
    `u${id.slice(0, 4)}@caja-chica.test`,
  ]);
  const membresia = await c.query(
    `insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales)
     values ($1, $2, $3, $4) returning id`,
    [id, empresa.empresaId, rol, rol <= 2],
  );
  if (rol > 2) {
    for (const sucursalId of sucursales) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        membresia.rows[0]!.id,
        sucursalId,
      ]);
    }
  }
}

async function pedir(
  metodo: string,
  ruta: string,
  usuarioId: string | null,
  cuerpo?: unknown,
  empresaId = esc.empresaId,
) {
  const respuesta = await fetch(`${url}/empresas/${empresaId}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuarioId ? { authorization: `Bearer ${usuarioId}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return {
    status: respuesta.status,
    cuerpo: (await respuesta.json()) as Record<string, unknown> | CajaChicaVista[],
  };
}

const lista = async (usuarioId: string) =>
  (await pedir("GET", "/cajas-chicas", usuarioId)).cuerpo as CajaChicaVista[];

function datosApertura(sucursalId = esc.sucursalId, cambios: Record<string, unknown> = {}) {
  return {
    sucursalId,
    cuentaTesoreriaId: sucursalId === esc.sucursalId ? tesoreriaPetty : tesoreriaPettyExtra,
    cuentaOrigenId: sucursalId === esc.sucursalId ? tesoreriaOrigen : tesoreriaOrigenExtra,
    fondoFijo: "200.00",
    fecha: "2026-10-01",
    ...cambios,
  };
}

function datosVale(cambios: Record<string, unknown> = {}) {
  return {
    fecha: "2026-10-05",
    comprobante: "F-001",
    concepto: "Papelería",
    montoNeto: "20.00",
    iva: "2.60",
    cuentaGastoId: cuentaGasto,
    ...cambios,
  };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_caja_chica");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-710101-101-1");
  ajena = await crearEscenario(c, "0614-710102-101-2");
  sucursalExtra = (
    await c.query(
      `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal norte', 'N002') returning id`,
      [esc.empresaId],
    )
  ).rows[0]!.id as string;

  await agregarCuenta(esc, "110102", "Caja chica");
  cuentaPetty = await agregarCuenta(esc, "11010201", "Caja chica matriz");
  cuentaPettyExtra = await agregarCuenta(esc, "11010202", "Caja chica norte");
  cuentaPettyAlterna = await agregarCuenta(esc, "11010203", "Caja chica matriz alterna");
  await agregarCuenta(esc, "110103", "Otras cajas");
  cuentaOrigenExtra = await agregarCuenta(esc, "11010301", "Caja norte");
  await agregarCuenta(esc, "52", "Costos y gastos", "costos_gastos");
  cuentaGasto = await agregarCuenta(esc, "5201", "Gastos generales", "costos_gastos");
  cuentaIva = await agregarCuenta(esc, "1112", "Crédito Fiscal IVA");
  cuentaOrigen = esc.cuentas["110101"]!;
  tesoreriaPetty = await agregarTesoreria(esc, esc.sucursalId, cuentaPetty, "Caja chica matriz");
  tesoreriaPettyExtra = await agregarTesoreria(esc, sucursalExtra, cuentaPettyExtra, "Caja chica norte");
  tesoreriaPettyAlterna = await agregarTesoreria(
    esc,
    esc.sucursalId,
    cuentaPettyAlterna,
    "Caja chica matriz alterna",
  );
  tesoreriaOrigen = await agregarTesoreria(esc, esc.sucursalId, cuentaOrigen, "Caja general");
  tesoreriaOrigenExtra = await agregarTesoreria(esc, sucursalExtra, cuentaOrigenExtra, "Caja norte");
  await agregarTesoreria(ajena, ajena.sucursalId, ajena.cuentas["110101"]!, "Caja general ajena");

  await usuario(CONTADOR, 2, esc);
  await usuario(AUXILIAR, 3, esc);
  await usuario(CONSULTA, 4, esc);
  await usuario(FORASTERO, 2, ajena);

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

describe("caja chica", () => {
  it("abre el fondo de 200.00 y genera una partida de apertura en borrador", async () => {
    const respuesta = await pedir("POST", "/cajas-chicas", CONTADOR, datosApertura());
    expect(respuesta.status).toBe(201);
    cajaMatriz = respuesta.cuerpo as unknown as CajaChicaVista;
    expect(cajaMatriz).toMatchObject({
      sucursalId: esc.sucursalId,
      sucursal: "Casa matriz",
      cuentaCodigo: "11010201",
      fondoFijo: "200.00",
      valesPorReintegrar: "0.00",
      efectivoDisponible: "200.00",
      vales: [],
    });
    const partida = await c.query(
      `select p.estado::text, p.origen, coalesce(sum(d.debe), 0)::text as debe,
              coalesce(sum(d.haber), 0)::text as haber
       from partidas p join partida_detalles d on d.partida_id = p.id where p.id = $1 group by p.id`,
      [cajaMatriz.partidaAperturaId],
    );
    expect(partida.rows[0]).toMatchObject({
      estado: "borrador",
      origen: "caja_chica_apertura",
      debe: "200.00",
      haber: "200.00",
    });
  });

  it("valida apertura, evita duplicados y limita la sucursal", async () => {
    expect(
      (await pedir("POST", "/cajas-chicas", CONTADOR, datosApertura(esc.sucursalId, { fondoFijo: "0" })))
        .status,
    ).toBe(400);
    expect(
      (await pedir("POST", "/cajas-chicas", CONTADOR, datosApertura(esc.sucursalId, { fecha: "01/10/2026" })))
        .status,
    ).toBe(400);
    expect(
      (await pedir("POST", "/cajas-chicas/55555555-5555-4555-8555-555555555555/vales", CONTADOR, datosVale()))
        .status,
    ).toBe(404);
    const duplicada = await pedir(
      "POST",
      "/cajas-chicas",
      CONTADOR,
      datosApertura(esc.sucursalId, { cuentaTesoreriaId: tesoreriaPettyAlterna }),
    );
    expect(duplicada.status).toBe(409);
    expect((await pedir("POST", "/cajas-chicas", AUXILIAR, datosApertura(sucursalExtra))).status).toBe(403);
    expect((await pedir("GET", "/cajas-chicas", FORASTERO)).status).toBe(404);
    expect((await pedir("GET", "/cajas-chicas", CONTADOR, undefined, ajena.empresaId)).status).toBe(404);
  });

  it("registra vales, protege el fondo y reintegra con una partida en borrador", async () => {
    const denegado = await pedir("POST", `/cajas-chicas/${cajaMatriz.id}/vales`, CONSULTA, datosVale());
    expect(denegado.status).toBe(403);
    const creado = await pedir("POST", `/cajas-chicas/${cajaMatriz.id}/vales`, CONTADOR, datosVale());
    expect(creado.status).toBe(201);
    let caja = creado.cuerpo as unknown as CajaChicaVista;
    expect(caja).toMatchObject({
      valesPorReintegrar: "22.60",
      efectivoDisponible: "177.40",
      totalVales: "22.60",
    });
    expect(caja.vales[0]).toMatchObject({
      comprobante: "F-001",
      concepto: "Papelería",
      montoNeto: "20.00",
      iva: "2.60",
      total: "22.60",
      estado: "por_reintegrar",
    });
    expect(
      (
        await pedir(
          "POST",
          `/cajas-chicas/${cajaMatriz.id}/vales`,
          CONTADOR,
          datosVale({ comprobante: "F-002", montoNeto: "180.00", iva: "0.00" }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await pedir(
          "POST",
          `/cajas-chicas/${cajaMatriz.id}/vales`,
          CONTADOR,
          datosVale({ montoNeto: "0", iva: "0" }),
        )
      ).status,
    ).toBe(400);

    const reintegrado = await pedir("POST", `/cajas-chicas/${cajaMatriz.id}/reintegrar`, CONTADOR, {
      fecha: "2026-10-10",
      cuentaOrigenId: tesoreriaOrigen,
    });
    expect(reintegrado.status).toBe(201);
    caja = reintegrado.cuerpo as unknown as CajaChicaVista;
    expect(caja).toMatchObject({ valesPorReintegrar: "0.00", efectivoDisponible: "200.00" });
    expect(caja.vales[0]).toMatchObject({ estado: "reintegrado", partidaReintegroId: expect.any(String) });
    const partidaId = caja.vales[0]!.partidaReintegroId!;
    const partida = await c.query(
      `select p.estado::text, p.origen, p.sucursal_id::text,
              coalesce(sum(d.debe), 0)::text as debe, coalesce(sum(d.haber), 0)::text as haber
       from partidas p join partida_detalles d on d.partida_id = p.id where p.id = $1 group by p.id`,
      [partidaId],
    );
    expect(partida.rows[0]).toMatchObject({
      estado: "borrador",
      origen: "caja_chica_reintegro",
      sucursal_id: esc.sucursalId,
      debe: "22.60",
      haber: "22.60",
    });
    const lineas = await c.query(
      `select cuenta_id::text, debe::text, haber::text from partida_detalles where partida_id = $1 order by orden`,
      [partidaId],
    );
    expect(lineas.rows).toEqual([
      { cuenta_id: cuentaGasto, debe: "20.00", haber: "0.00" },
      { cuenta_id: cuentaIva, debe: "2.60", haber: "0.00" },
      { cuenta_id: cuentaOrigen, debe: "0.00", haber: "22.60" },
    ]);
    expect(
      (
        await pedir("POST", `/cajas-chicas/${cajaMatriz.id}/reintegrar`, CONTADOR, {
          fecha: "2026-10-11",
          cuentaOrigenId: tesoreriaOrigen,
        })
      ).status,
    ).toBe(422);
  });

  it("registra bitácora y filtra las cajas por sucursal para el auxiliar", async () => {
    const cajaNueva = await pedir("POST", "/cajas-chicas", CONTADOR, datosApertura(sucursalExtra));
    expect(cajaNueva.status).toBe(201);
    cajaExtra = cajaNueva.cuerpo as unknown as CajaChicaVista;
    const auxiliares = await lista(AUXILIAR);
    expect(auxiliares.map((caja) => caja.sucursalId)).toEqual([esc.sucursalId]);
    const acciones = await c.query(
      `select distinct tabla, accion from bitacora where empresa_id = $1 and usuario_id = $2
       and tabla in ('cajas_chicas', 'vales_caja_chica')`,
      [esc.empresaId, CONTADOR],
    );
    expect(acciones.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tabla: "cajas_chicas", accion: "INSERT" }),
        expect.objectContaining({ tabla: "vales_caja_chica", accion: "INSERT" }),
        expect.objectContaining({ tabla: "vales_caja_chica", accion: "UPDATE" }),
      ]),
    );
  });

  it("serializa vales concurrentes para evitar saldo negativo", async () => {
    const peticiones = await Promise.all([
      pedir(
        "POST",
        `/cajas-chicas/${cajaExtra.id}/vales`,
        CONTADOR,
        datosVale({ comprobante: "C-001", montoNeto: "120", iva: "0" }),
      ),
      pedir(
        "POST",
        `/cajas-chicas/${cajaExtra.id}/vales`,
        CONTADOR,
        datosVale({ comprobante: "C-002", montoNeto: "120", iva: "0" }),
      ),
    ]);
    expect(peticiones.map((respuesta) => respuesta.status).sort()).toEqual([201, 422]);
    const caja = (await lista(CONTADOR)).find((item) => item.id === cajaExtra.id)!;
    expect(caja).toMatchObject({ valesPorReintegrar: "120.00", efectivoDisponible: "80.00" });
  });
});
