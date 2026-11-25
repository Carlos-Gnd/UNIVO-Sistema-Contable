// Estado de cambios en el patrimonio (HU-40, S3-T21) de punta a punta con el caso CheroPhonex: el patrimonio
// final coincide con el del balance general, al cierre y en cualquier fecha del ejercicio.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  Dinero,
  type BalanceGeneral,
  type EstadoCambiosPatrimonio,
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

const patrimonio = (query: string, usuario?: string) =>
  pedir<EstadoCambiosPatrimonio>(`/estados/cambios-patrimonio?${query}`, usuario);

/** Renglón del estado por su identificador, con sus valores por columna. */
const renglon = (e: EstadoCambiosPatrimonio, id: string) => e.renglones.find((r) => r.id === id);
const porColumna = (e: EstadoCambiosPatrimonio, id: string) =>
  Object.fromEntries(e.columnas.map((col, i) => [col.id, renglon(e, id)?.valores[i]]));

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_patrimonio");
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

describe("estado de cambios en el patrimonio de octubre de 2026 (S3-T19)", () => {
  let e: EstadoCambiosPatrimonio;
  beforeAll(async () => {
    const r = await patrimonio("desde=2026-10-01&hasta=2026-10-31");
    expect(r.status).toBe(200);
    e = r.cuerpo;
  });

  it("CheroPhonex es persona natural: capital, utilidades y retiros del titular", () => {
    expect(e.tipoContribuyente).toBe("persona_natural");
    expect(e.columnas.map((col) => col.id)).toEqual(["capital", "utilidades", "retiros"]);
    expect(e.columnas.map((col) => col.titulo)).toEqual(["Capital", "Utilidades", "Retiros del titular"]);
  });

  it("parte de cero, suma los aportes y el resultado y resta los retiros", () => {
    expect(e.renglones.map((r) => r.id)).toEqual([
      "saldo-inicial",
      "aportes",
      "resultado",
      "retiros",
      "saldo-final",
    ]);
    expect(porColumna(e, "saldo-inicial")).toEqual({ capital: "0.00", utilidades: "0.00", retiros: "0.00" });
    expect(porColumna(e, "aportes")).toEqual({
      capital: monto(esperado.balanceGeneral.capital),
      utilidades: "0.00",
      retiros: "0.00",
    });
    expect(porColumna(e, "resultado")).toEqual({
      capital: "0.00",
      utilidades: monto(esperado.estadoDeResultados.utilidadNeta),
      retiros: "0.00",
    });
    expect(porColumna(e, "retiros")).toEqual({ capital: "0.00", utilidades: "0.00", retiros: "-450.00" });
  });

  it("el patrimonio final de CheroPhonex coincide con el del balance general: US$ 29,644.99", async () => {
    const bg = (await pedir<BalanceGeneral>("/estados/balance-general?fecha=2026-10-31")).cuerpo;
    expect(e.patrimonioFinal).toBe(monto(esperado.balanceGeneral.totalPatrimonio));
    expect(e.patrimonioFinal).toBe("29644.99");
    expect(e.patrimonioFinal).toBe(bg.patrimonio.total);
    expect(renglon(e, "saldo-final")?.total).toBe(bg.patrimonio.total);
  });

  it("el resultado del período es la utilidad neta del estado de resultados", async () => {
    const er = (await pedir<EstadoResultados>("/estados/resultados?desde=2026-10-01&hasta=2026-10-31"))
      .cuerpo;
    expect(renglon(e, "resultado")?.total).toBe(er.utilidadNeta);
  });

  it("cada renglón suma sus columnas y el saldo final es el inicial más los movimientos", () => {
    for (const r of e.renglones) {
      expect(r.total).toBe(Dinero.sumar(r.valores).aTexto());
    }
    const movimientos = e.renglones.filter((r) => r.id !== "saldo-inicial" && r.id !== "saldo-final");
    const final = Dinero.de(renglon(e, "saldo-inicial")!.total).mas(
      Dinero.sumar(movimientos.map((r) => r.total)),
    );
    expect(final.aTexto()).toBe(e.patrimonioFinal);
  });
});

describe("el patrimonio final coincide con el balance general en cualquier fecha (S3-T21)", () => {
  it.each(["2026-10-15", "2026-10-30", "2026-10-31"])(
    "del 1 de octubre al %s, antes y después del cierre",
    async (hasta) => {
      const e = (await patrimonio(`desde=2026-10-01&hasta=${hasta}`)).cuerpo;
      const bg = (await pedir<BalanceGeneral>(`/estados/balance-general?fecha=${hasta}`)).cuerpo;
      expect(e.patrimonioFinal).toBe(bg.patrimonio.total);
    },
  );

  it("un período a mitad de mes arranca con el patrimonio que dejó el anterior", async () => {
    const primera = (await patrimonio("desde=2026-10-01&hasta=2026-10-14")).cuerpo;
    const segunda = (await patrimonio("desde=2026-10-15&hasta=2026-10-31")).cuerpo;
    expect(renglon(segunda, "saldo-inicial")?.total).toBe(primera.patrimonioFinal);
    expect(segunda.patrimonioFinal).toBe("29644.99");
  });
});

describe("permisos y filtros del estado de patrimonio", () => {
  it("un usuario ajeno a la empresa recibe 404", async () => {
    expect((await patrimonio("desde=2026-10-01&hasta=2026-10-31", AJENO)).status).toBe(404);
  });

  it("un auxiliar de otra sucursal ve solo lo suyo: sin movimientos, patrimonio en cero", async () => {
    const r = await patrimonio("desde=2026-10-01&hasta=2026-10-31", AUXILIAR);
    expect(r.status).toBe(200);
    expect(r.cuerpo.patrimonioFinal).toBe("0.00");
  });

  it("rechaza fechas inválidas y períodos que cruzan ejercicios", async () => {
    expect((await patrimonio("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await patrimonio("desde=2026-10-01&hasta=2027-01-31")).status).toBe(422);
  });
});
