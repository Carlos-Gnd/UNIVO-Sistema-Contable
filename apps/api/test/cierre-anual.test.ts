import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  Dinero,
  type EstadoCierreAnual,
  type PartidaAnualVista,
  type ResultadoProvisionIsr,
} from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarCasoCherophonex } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONSULTA = "22222222-2222-4222-8222-222222222222";
const AJENO = "33333333-3333-4333-8333-333333333333";
const TABLA_OFICIAL = [
  { desde: "0.00", hasta: "6600.00", porcentaje: "0.00", cuotaFija: "0.00" },
  { desde: "6600.00", hasta: "10742.86", porcentaje: "10.00", cuotaFija: "212.12" },
  { desde: "10742.86", hasta: "24457.14", porcentaje: "20.00", cuotaFija: "720.00" },
  { desde: "24457.14", hasta: null, porcentaje: "30.00", cuotaFija: "3462.86" },
];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let chero: { empresaId: string; sucursalId: string };
let secundario: Escenario;

async function usuario(id: string, nombre: string) {
  await c.query("INSERT INTO usuarios (id, nombre, correo) VALUES ($1, $2, $3)", [
    id,
    nombre,
    `${id.slice(0, 4)}@cierre.test`,
  ]);
}

async function miembro(usuarioId: string, empresaId: string, rol: number, todas: boolean) {
  const membresia = await c.query<{ id: string }>(
    "INSERT INTO membresias (usuario_id, empresa_id, rol_id, todas_sucursales) VALUES ($1, $2, $3, $4) RETURNING id",
    [usuarioId, empresaId, rol, todas],
  );
  return membresia.rows[0]!.id;
}

async function pedir(metodo: string, ruta: string, usuarioId: string, cuerpo?: unknown) {
  const respuesta = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${usuarioId}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

const ruta = (empresaId: string, sufijo = "") => `/empresas/${empresaId}/cierre-anual${sufijo}`;
const PARTIDA_CIERRE = (empresaId: string) => ruta(empresaId, "/ejercicios/2026/partida-cierre");
const CONFIRMAR_CIERRE = (empresaId: string) => ruta(empresaId, "/ejercicios/2026/confirmar-cierre");
const PARTIDA_REAPERTURA = (empresaId: string) => ruta(empresaId, "/ejercicios/2026/reapertura");

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_cierre_anual");
  c = await reiniciarBase(urlBase);
  const carga = await cargarCasoCherophonex(c);
  chero = { empresaId: carga.empresaId, sucursalId: carga.sucursalId };
  secundario = await crearEscenario(c, "0614-850001-101-3");

  await usuario(CONTADOR, "Contador");
  await usuario(CONSULTA, "Consulta");
  await miembro(CONTADOR, chero.empresaId, 2, true);
  const consulta = await miembro(CONSULTA, chero.empresaId, 4, false);
  await c.query("INSERT INTO membresia_sucursales (membresia_id, sucursal_id) VALUES ($1, $2)", [
    consulta,
    chero.sucursalId,
  ]);
  await miembro(CONTADOR, secundario.empresaId, 2, true);

  const ejercicios = await c.query<{ id: string }>(
    "SELECT id FROM ejercicios WHERE empresa_id = $1 AND anio = 2026",
    [chero.empresaId],
  );
  await c.query("UPDATE periodos SET estado = 'cerrado' WHERE ejercicio_id = $1 AND mes <= 11", [
    ejercicios.rows[0]!.id,
  ]);
  const ejercicioSecundario = await c.query<{ id: string }>(
    "SELECT id FROM ejercicios WHERE empresa_id = $1 AND anio = 2026",
    [secundario.empresaId],
  );
  await c.query("UPDATE periodos SET estado = 'cerrado' WHERE ejercicio_id = $1 AND mes <= 10", [
    ejercicioSecundario.rows[0]!.id,
  ]);

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

describe("cierre anual e ISR (HU-34)", () => {
  it("muestra validaciones y exige configurar la tasa antes de calcular", async () => {
    const estado = await pedir("GET", ruta(chero.empresaId, "?anio=2026"), CONTADOR);
    expect(estado.status).toBe(200);
    const datos = estado.cuerpo as unknown as EstadoCierreAnual;
    expect(datos).toMatchObject({
      anio: 2026,
      tipoContribuyente: "persona_natural",
      listoParaIsr: true,
      validaciones: {
        sinBorradores: { ok: true, cantidad: 0 },
        periodosListos: { ok: true, cerrados: 11, total: 12, mesesAbiertos: [12] },
        partidasCuadradas: { ok: true, cantidad: 0 },
        balanza: { ok: true, debe: "70971.00", haber: "70971.00", diferencia: "0.00" },
      },
      configuracionIsr: {
        version: 1,
        tipoContribuyente: "persona_natural",
        tasaSociedad: null,
        tramos: TABLA_OFICIAL,
      },
      detalleIsr: {
        utilidadAntesImpuesto: "7594.99",
        impuestoDeterminado: "311.62",
        pagosACuenta: "805.90",
        pagosAplicados: "311.62",
        impuestoPendiente: "0.00",
        saldoAFavor: "494.28",
      },
    });
  });

  it("rechaza esquemas inválidos y tipos de contribuyente distintos a la empresa", async () => {
    const invalida = await pedir("POST", ruta(chero.empresaId, "/configuracion-isr"), CONTADOR, {
      anio: 2026,
      tipoContribuyente: "persona_natural",
      tramos: [TABLA_OFICIAL[0], { ...TABLA_OFICIAL[1]!, desde: "6600.01" }, ...TABLA_OFICIAL.slice(2)],
    });
    expect(invalida.status).toBe(400);

    const tipoIncorrecto = await pedir("POST", ruta(chero.empresaId, "/configuracion-isr"), CONTADOR, {
      anio: 2026,
      tipoContribuyente: "sociedad",
      tasaSociedad: "25.00",
    });
    expect(tipoIncorrecto.status).toBe(422);
  });

  it("calcula CheroPhonex, acredita pagos a cuenta y genera un borrador balanceado", async () => {
    const calculado = await pedir("POST", ruta(chero.empresaId, "/ejercicios/2026/impuesto-renta"), CONTADOR);
    expect(calculado.status).toBe(201);
    const resultado = calculado.cuerpo as unknown as ResultadoProvisionIsr;
    expect(resultado.detalle).toMatchObject({
      utilidadAntesImpuesto: "7594.99",
      pagosACuenta: "805.90",
      impuestoDeterminado: "311.62",
      pagosAplicados: "311.62",
      impuestoPendiente: "0.00",
      saldoAFavor: "494.28",
    });
    expect(resultado.partida).toMatchObject({ estado: "borrador", fecha: "2026-12-31" });

    const lineas = await c.query(
      `SELECT p.estado::text AS estado, c.codigo, d.debe::text AS debe, d.haber::text AS haber
       FROM partidas p JOIN partida_detalles d ON d.partida_id = p.id JOIN cuentas c ON c.id = d.cuenta_id
       WHERE p.id = $1 ORDER BY d.orden`,
      [resultado.partida!.id],
    );
    expect(lineas.rows).toEqual([
      { estado: "borrador", codigo: "4204", debe: "311.62", haber: "0.00" },
      { estado: "borrador", codigo: "111104", debe: "0.00", haber: "311.62" },
    ]);

    const repetido = await pedir("POST", ruta(chero.empresaId, "/ejercicios/2026/impuesto-renta"), CONTADOR);
    expect(repetido.status).toBe(201);
    expect((repetido.cuerpo as unknown as ResultadoProvisionIsr).partida?.id).toBe(resultado.partida?.id);
    const cuentaPartidas = await c.query(
      "SELECT count(*)::int AS cantidad FROM partidas WHERE empresa_id = $1 AND origen = 'isr_ejercicio' AND estado <> 'anulada'",
      [chero.empresaId],
    );
    expect(cuentaPartidas.rows[0]?.cantidad).toBe(1);
  });

  it("no permite configurar otra tasa mientras la provisión siga activa", async () => {
    const respuesta = await pedir("POST", ruta(chero.empresaId, "/configuracion-isr"), CONTADOR, {
      anio: 2026,
      tipoContribuyente: "persona_natural",
      tramos: TABLA_OFICIAL,
    });
    expect(respuesta.status).toBe(409);
  });

  it("cierra noviembre y mantiene diciembre abierto para los ajustes anuales", async () => {
    const antes = await pedir("GET", ruta(secundario.empresaId, "?anio=2026"), CONTADOR);
    expect(antes.status).toBe(200);
    expect((antes.cuerpo as unknown as EstadoCierreAnual).listoParaIsr).toBe(false);

    const cierre = await pedir(
      "POST",
      ruta(secundario.empresaId, "/ejercicios/2026/cerrar-noviembre"),
      CONTADOR,
    );
    expect(cierre.status, JSON.stringify(cierre.cuerpo)).toBe(201);
    expect(cierre.cuerpo).toMatchObject({
      listoParaIsr: true,
      validaciones: { periodosListos: { ok: true, cerrados: 11, total: 12, mesesAbiertos: [12] } },
    });
  });

  it("respeta el permiso de lectura y el alcance por sucursal", async () => {
    const lectura = await pedir("GET", ruta(chero.empresaId, "?anio=2026"), CONSULTA);
    expect(lectura.status).toBe(200);
    expect(lectura.cuerpo).toMatchObject({ todasSucursales: false, listoParaIsr: false, detalleIsr: null });

    const generar = await pedir("POST", ruta(chero.empresaId, "/ejercicios/2026/impuesto-renta"), CONSULTA);
    expect(generar.status).toBe(403);

    const ajeno = await pedir("GET", ruta(chero.empresaId, "?anio=2026"), AJENO);
    expect(ajeno.status).toBe(404);
  });

  it("liquida las cuentas de resultado, conserva los saldos y genera la reapertura exacta", async () => {
    const ISR_SIN_CONTABILIZAR = await pedir("POST", PARTIDA_CIERRE(chero.empresaId), CONTADOR);
    expect(ISR_SIN_CONTABILIZAR.status).toBe(409);

    await c.query(
      "UPDATE partidas SET estado = 'contabilizada' WHERE empresa_id = $1 AND origen = 'isr_ejercicio' AND estado = 'borrador'",
      [chero.empresaId],
    );
    const estadoListo = await pedir("GET", ruta(chero.empresaId, "?anio=2026"), CONTADOR);
    expect(estadoListo.cuerpo).toMatchObject({
      vistaCierre: { utilidadNeta: "7283.37" },
      partidaIsr: { estado: "contabilizada" },
    });
    const antesCierre = await c.query<{ total: string }>(
      `SELECT COALESCE(sum(d.debe - d.haber), 0)::numeric(14,2)::text AS total
       FROM partida_detalles d JOIN partidas p ON p.id = d.partida_id JOIN cuentas c ON c.id = d.cuenta_id
       WHERE p.empresa_id = $1 AND p.estado IN ('contabilizada', 'anulada') AND c.tipo = 'activo'`,
      [chero.empresaId],
    );

    const generada = await pedir("POST", PARTIDA_CIERRE(chero.empresaId), CONTADOR);
    expect(generada.status).toBe(201);
    const cierre = generada.cuerpo as unknown as PartidaAnualVista;
    expect(cierre).toMatchObject({ estado: "borrador", fecha: "2026-12-31" });
    expect(cierre.lineas.some((linea) => linea.codigo === "6101")).toBe(true);
    expect(
      Dinero.sumar(cierre.lineas.map((linea) => linea.debe)).igualA(
        Dinero.sumar(cierre.lineas.map((linea) => linea.haber)),
      ),
    ).toBe(true);
    const repetida = await pedir("POST", PARTIDA_CIERRE(chero.empresaId), CONTADOR);
    expect(repetida.cuerpo).toMatchObject({ id: cierre.id });

    const cierreContabilizado = await c.query("UPDATE partidas SET estado = 'contabilizada' WHERE id = $1", [
      cierre.id,
    ]);
    expect(cierreContabilizado.rowCount).toBe(1);
    const cierreConfirmado = await pedir("POST", CONFIRMAR_CIERRE(chero.empresaId), CONTADOR);
    expect(cierreConfirmado.status).toBe(201);
    expect(cierreConfirmado.cuerpo).toMatchObject({
      ejercicioCerrado: true,
      partidaCierre: { estado: "contabilizada" },
    });

    const resultadosPendientes = await c.query<{ codigo: string; saldo: string }>(
      `SELECT c.codigo, sum(d.debe - d.haber)::numeric(14,2)::text AS saldo
       FROM partida_detalles d JOIN partidas p ON p.id = d.partida_id
         JOIN cuentas c ON c.id = d.cuenta_id
         WHERE p.empresa_id = $1 AND p.fecha BETWEEN '2026-01-01' AND '2026-12-31'
           AND p.estado IN ('contabilizada', 'anulada') AND c.tipo IN ('ingresos', 'costos_gastos')
       GROUP BY c.codigo HAVING sum(d.debe - d.haber) <> 0 ORDER BY c.codigo`,
      [chero.empresaId],
    );
    expect(resultadosPendientes.rows).toEqual([]);
    const despuesCierre = await c.query<{ total: string }>(
      `SELECT COALESCE(sum(d.debe - d.haber), 0)::numeric(14,2)::text AS total
       FROM partida_detalles d JOIN partidas p ON p.id = d.partida_id JOIN cuentas c ON c.id = d.cuenta_id
       WHERE p.empresa_id = $1 AND p.estado IN ('contabilizada', 'anulada') AND c.tipo = 'activo'`,
      [chero.empresaId],
    );
    expect(despuesCierre.rows[0]?.total).toBe(antesCierre.rows[0]?.total);

    await c.query(
      "INSERT INTO ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) VALUES ($1, 2027, '2027-01-01', '2027-12-31')",
      [chero.empresaId],
    );
    const estadoCerrado = await pedir("GET", ruta(chero.empresaId, "?anio=2026"), CONTADOR);
    const vista = (estadoCerrado.cuerpo as unknown as EstadoCierreAnual).vistaReapertura;
    expect(vista?.lineas.length).toBeGreaterThan(0);

    const reaperturaRespuesta = await pedir("POST", PARTIDA_REAPERTURA(chero.empresaId), CONTADOR);
    expect(reaperturaRespuesta.status).toBe(201);
    const reapertura = reaperturaRespuesta.cuerpo as unknown as PartidaAnualVista;
    expect(reapertura).toMatchObject({ estado: "borrador", fecha: "2027-01-01" });
    expect(reapertura.lineas).toEqual(vista?.lineas);
    const repetidaReapertura = await pedir("POST", PARTIDA_REAPERTURA(chero.empresaId), CONTADOR);
    expect(repetidaReapertura.cuerpo).toMatchObject({ id: reapertura.id });
  });
});
