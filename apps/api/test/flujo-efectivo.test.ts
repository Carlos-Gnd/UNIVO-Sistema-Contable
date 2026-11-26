// Estado de flujo de efectivo (HU-41, S3-T24) de punta a punta con el caso CheroPhonex: el efectivo final
// coincide con el del balance general, al cierre y en cualquier fecha del ejercicio.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  Dinero,
  type BalanceGeneral,
  type EstadoFlujoEfectivo,
  type EstadoResultados,
} from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cargarCasoCherophonex,
  leerCaso,
  type CasoCargado,
} from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const AJENO = "33333333-3333-4333-8333-333333333333";

const esperado = leerCaso().esperado;
const monto = (valor: string) => Dinero.de(valor).aTexto();

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;

async function pedir<T>(ruta: string, usuario = CONTADOR) {
  const r = await fetch(`${url}/empresas/${carga.empresaId}${ruta}`, {
    headers: { authorization: `Bearer ${usuario}` },
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}

const flujo = (query: string, usuario?: string) =>
  pedir<EstadoFlujoEfectivo>(`/estados/flujo-efectivo?${query}`, usuario);

/** Efectivo y equivalentes (cuenta de mayor 1101) del balance general. */
const efectivoDelBalance = async (fecha: string) => {
  const bg = (await pedir<BalanceGeneral>(`/estados/balance-general?fecha=${fecha}`)).cuerpo;
  return bg.activoCorriente.renglones.find((r) => r.codigo === "1101")?.monto ?? "0.00";
};
const renglon = (a: EstadoFlujoEfectivo["operacion"], id: string) => a.renglones.find((r) => r.id === id);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_flujo");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c);
  for (const [id, nombre] of [
    [CONTADOR, "Contador"],
    [AUXILIAR, "Auxiliar"],
    [AJENO, "Ajeno"],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${nombre.toLowerCase()}@prueba.sv`,
    ]);
  }
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, carga.empresaId],
  );
  const s = await c.query<{ id: string }>(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal Usulután', 'S002') returning id`,
    [carga.empresaId],
  );
  const m = await c.query<{ id: string }>(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 3, false) returning id",
    [AUXILIAR, carga.empresaId],
  );
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    m.rows[0]!.id,
    s.rows[0]!.id,
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

describe("flujo de efectivo de octubre de 2026 (S3-T22)", () => {
  let e: EstadoFlujoEfectivo;
  beforeAll(async () => {
    const r = await flujo("desde=2026-10-01&hasta=2026-10-31");
    expect(r.status).toBe(200);
    e = r.cuerpo;
  });

  it("el efectivo final es el del balance general: US$ 22,270.89", async () => {
    expect(e.efectivoFinal).toBe(await efectivoDelBalance("2026-10-31"));
    expect(e.efectivoFinal).toBe("22270.89");
    expect(e.efectivoInicial).toBe("0.00");
  });

  it("la variación neta coincide con la de las cuentas de caja y bancos", () => {
    expect(e.variacionNeta).toBe("22270.89");
    expect(e.variacionLibros).toBe(e.variacionNeta);
    expect(e.cuadra).toBe(true);
    expect(Dinero.sumar([e.operacion.total, e.inversion.total, e.financiamiento.total]).aTexto()).toBe(
      e.variacionNeta,
    );
  });

  it("parte de la utilidad neta del estado de resultados y suma la depreciación", async () => {
    const er = (await pedir<EstadoResultados>("/estados/resultados?desde=2026-10-01&hasta=2026-10-31"))
      .cuerpo;
    expect(renglon(e.operacion, "utilidad-neta")?.monto).toBe(er.utilidadNeta);
    expect(er.utilidadNeta).toBe(monto(esperado.estadoDeResultados.utilidadNeta));
    expect(renglon(e.operacion, "depreciacion")?.monto).toBe("104.17");
  });

  it("clasifica el capital de trabajo, el mobiliario y el aporte con los valores del caso", () => {
    expect(renglon(e.operacion, "inventarios")?.monto).toBe("-5888.00");
    expect(renglon(e.operacion, "cuentas-por-cobrar")?.monto).toBe("-600.00");
    expect(renglon(e.operacion, "gastos-anticipados")?.monto).toBe("-805.90");
    expect(renglon(e.operacion, "retenciones")?.monto).toBe("246.02");
    expect(renglon(e.operacion, "empleados")?.monto).toBe("620.04");
    expect(renglon(e.operacion, "impuestos")?.monto).toBe("1449.57");
    expect(e.operacion.total).toBe("2720.89");
    expect(renglon(e.inversion, "activo-fijo")?.monto).toBe("-2500.00");
    expect(renglon(e.financiamiento, "aportes")?.monto).toBe("22500.00");
    expect(renglon(e.financiamiento, "retiros")?.monto).toBe("-450.00");
  });
});

describe("el efectivo final coincide con el balance general en cualquier fecha (S3-T24)", () => {
  it.each(["2026-10-15", "2026-10-30", "2026-10-31"])(
    "del 1 de octubre al %s, antes y después del cierre",
    async (hasta) => {
      const e = (await flujo(`desde=2026-10-01&hasta=${hasta}`)).cuerpo;
      expect(e.efectivoFinal).toBe(await efectivoDelBalance(hasta));
      expect(e.cuadra).toBe(true);
    },
  );

  it("un período a mitad de mes arranca con el efectivo que dejó el anterior", async () => {
    const primera = (await flujo("desde=2026-10-01&hasta=2026-10-14")).cuerpo;
    const segunda = (await flujo("desde=2026-10-15&hasta=2026-10-31")).cuerpo;
    expect(segunda.efectivoInicial).toBe(primera.efectivoFinal);
    expect(segunda.efectivoFinal).toBe("22270.89");
    expect(segunda.cuadra).toBe(true);
  });

  it("el formato NIIF para las PYMES da las mismas cifras con otros nombres", async () => {
    const clase = (await flujo("desde=2026-10-01&hasta=2026-10-31&formato=clase")).cuerpo;
    const niif = (await flujo("desde=2026-10-01&hasta=2026-10-31&formato=niif_pymes")).cuerpo;
    expect(niif.titulo).toBe("Estado de flujos de efectivo");
    expect(niif.variacionNeta).toBe(clase.variacionNeta);
    expect(niif.efectivoFinal).toBe(clase.efectivoFinal);
  });
});

describe("permisos y filtros del flujo de efectivo", () => {
  it("un usuario ajeno a la empresa recibe 404", async () => {
    expect((await flujo("desde=2026-10-01&hasta=2026-10-31", AJENO)).status).toBe(404);
  });

  it("un auxiliar de otra sucursal ve solo lo suyo: sin movimientos, efectivo en cero", async () => {
    const r = await flujo("desde=2026-10-01&hasta=2026-10-31", AUXILIAR);
    expect(r.status).toBe(200);
    expect(r.cuerpo.efectivoFinal).toBe("0.00");
    expect(r.cuerpo.cuadra).toBe(true);
  });

  it("rechaza fechas inválidas y períodos que cruzan ejercicios", async () => {
    expect((await flujo("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await flujo("desde=2026-10-01&hasta=2027-01-31")).status).toBe(422);
  });
});
