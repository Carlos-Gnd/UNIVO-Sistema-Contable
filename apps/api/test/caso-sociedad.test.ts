import type { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseAuthGuard } from "../src/auth/supabase-auth.guard.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { BaseDatos, BaseDatosModule } from "../src/compartido/base-datos.js";
import { EmpresaActivaGuard } from "../src/compartido/empresa-activa.guard.js";
import { PermisoGuard } from "../src/compartido/permiso.guard.js";
import { CierreAnualModule } from "../src/modules/cierre-anual/cierre-anual.module.js";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const ANIO = 2026;
let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let baseUrl: string;
let empresaId: string;
let sucursalId: string;

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

function ruta(sufijo = "") {
  return `/empresas/${empresaId}/cierre-anual${sufijo}`;
}

async function partida(concepto: string, fecha: string, lineas: [string, string, string][]) {
  const creada = await c.query<{ id: string }>(
    `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto)
     values ($1, $2, $3::date, 'operacion', $4) returning id`,
    [empresaId, sucursalId, fecha, concepto],
  );
  for (const [orden, [codigo, debe, haber]] of lineas.entries()) {
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden)
       select $1, id, $3, $4, $5 from cuentas where empresa_id = $2 and codigo = $6`,
      [creada.rows[0]!.id, empresaId, debe, haber, orden, codigo],
    );
  }
  await c.query("update partidas set estado = 'contabilizada' where id = $1", [creada.rows[0]!.id]);
}

beforeAll(async () => {
  const url = await basePropia("contable_api_caso_sociedad");
  c = await reiniciarBase(url);
  const empresa = await c.query<{ id: string }>(
    `insert into empresas (nombre, nit, tipo_contribuyente) values ('Sociedad Ejemplo, S.A. de C.V.', '0614-010190-101-5', 'sociedad') returning id`,
  );
  empresaId = empresa.rows[0]!.id;
  const sucursal = await c.query<{ id: string }>(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento, es_matriz)
     values ($1, 'Casa matriz', 'M001', true) returning id`,
    [empresaId],
  );
  sucursalId = sucursal.rows[0]!.id;
  for (const anio of [ANIO, ANIO + 1]) {
    await c.query(
      `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin)
       values ($1, $2::smallint, make_date($2::int, 1, 1), make_date($2::int, 12, 31))`,
      [empresaId, anio],
    );
  }
  await c.query("select interno.copiar_catalogo_base($1)", [empresaId]);
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Administradora', 'sociedad@prueba.sv')",
    [ADMIN],
  );
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [ADMIN, empresaId],
  );
  await partida("Aporte de capital social", "2026-01-01", [
    ["11010301", "10000.00", "0.00"],
    ["3101", "0.00", "10000.00"],
  ]);
  await partida("Ventas del ejercicio", "2026-01-15", [
    ["11010301", "10000.00", "0.00"],
    ["5101", "0.00", "10000.00"],
  ]);
  await partida("Gastos de administración", "2026-01-20", [
    ["4201", "1000.00", "0.00"],
    ["11010301", "0.00", "1000.00"],
  ]);
  const ejercicio = await c.query<{ id: string }>(
    "select id from ejercicios where empresa_id = $1 and anio = $2",
    [empresaId, ANIO],
  );
  await c.query("update periodos set estado = 'cerrado' where ejercicio_id = $1 and mes <= 11", [
    ejercicio.rows[0]!.id,
  ]);

  process.env["DATABASE_URL"] = url;
  const modulo = await Test.createTestingModule({
    imports: [BaseDatosModule, CierreAnualModule],
    providers: [SupabaseAuthService],
  })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  const reflector = modulo.get(Reflector);
  const baseDatos = modulo.get(BaseDatos);
  app.useGlobalGuards(
    new SupabaseAuthGuard(reflector, modulo.get(SupabaseAuthService)),
    new EmpresaActivaGuard(reflector, baseDatos),
    new PermisoGuard(reflector, baseDatos),
  );
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("caso de sociedad: ISR, reserva legal, cierre y reapertura", () => {
  it("coincide con el cálculo manual del ejercicio", async () => {
    const configuracion = await pedir("POST", ruta("/configuracion-isr"), {
      anio: ANIO,
      tipoContribuyente: "sociedad",
      tasaSociedad: "30.00",
    });
    expect(configuracion.status).toBe(201);

    const impuesto = await pedir("POST", ruta(`/ejercicios/${ANIO}/impuesto-renta`));
    expect(impuesto.status).toBe(201);
    expect(impuesto.cuerpo).toMatchObject({
      detalle: {
        utilidadAntesImpuesto: "9000.00",
        capitalSocial: "10000.00",
        impuestoDeterminado: "2700.00",
        utilidadDespuesDeImpuesto: "6300.00",
        limiteReservaLegal: "2000.00",
        reservaLegalAProvisionar: "441.00",
      },
    });

    const idIsr = (impuesto.cuerpo as { partida: { id: string } }).partida.id;
    await c.query("update partidas set estado = 'contabilizada' where id = $1", [idIsr]);
    const cierre = await pedir("POST", ruta(`/ejercicios/${ANIO}/partida-cierre`));
    expect(cierre.status).toBe(201);
    expect(cierre.cuerpo).toMatchObject({
      estado: "borrador",
      lineas: expect.arrayContaining([
        expect.objectContaining({ codigo: "3103", debe: "0.00", haber: "441.00" }),
        expect.objectContaining({ codigo: "3106", debe: "441.00", haber: "0.00" }),
      ]),
    });

    const idCierre = (cierre.cuerpo as { id: string }).id;
    await c.query("update partidas set estado = 'contabilizada' where id = $1", [idCierre]);
    const confirmado = await pedir("POST", ruta(`/ejercicios/${ANIO}/confirmar-cierre`));
    expect(confirmado.status).toBe(201);

    const reapertura = await pedir("POST", ruta(`/ejercicios/${ANIO}/reapertura`));
    expect(reapertura.status).toBe(201);
    expect(reapertura.cuerpo).toMatchObject({ estado: "borrador", fecha: "2027-01-01" });
    expect(
      (reapertura.cuerpo as { lineas: { codigo: string; debe: string; haber: string }[] }).lineas,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codigo: "3101", haber: "10000.00" }),
        expect.objectContaining({ codigo: "3103", haber: "441.00" }),
        expect.objectContaining({ codigo: "3106", haber: "5859.00" }),
      ]),
    );
  });
});
