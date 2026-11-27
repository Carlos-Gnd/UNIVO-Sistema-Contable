// Formato de clase o NIIF para las PYMES (HU-42, S3-T27): el mismo ejercicio de CheroPhonex se presenta en los
// dos formatos con las mismas cifras; solo cambian los nombres.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  BalanceGeneral,
  EstadoCambiosPatrimonio,
  EstadoResultados,
  SeccionEstado,
} from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarCasoCherophonex, type CasoCargado } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const ADMIN = "44444444-4444-4444-8444-444444444444";

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

const PERIODO = "desde=2026-10-01&hasta=2026-10-31";
const resultados = (formato?: string) =>
  pedir<EstadoResultados>(`/estados/resultados?${PERIODO}${formato ? `&formato=${formato}` : ""}`);
const balance = (formato?: string) =>
  pedir<BalanceGeneral>(`/estados/balance-general?fecha=2026-10-31${formato ? `&formato=${formato}` : ""}`);
const patrimonio = (formato?: string) =>
  pedir<EstadoCambiosPatrimonio>(
    `/estados/cambios-patrimonio?${PERIODO}${formato ? `&formato=${formato}` : ""}`,
  );

/** Solo las cifras: quita los nombres que cambian entre formatos (títulos y rótulos). */
const cifrasDe = (s: SeccionEstado) => ({ total: s.total, renglones: s.renglones });

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_formato_estados");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c);
  for (const [id, nombre, rol] of [
    [CONTADOR, "Contador", 2],
    [ADMIN, "Administrador", 1],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${nombre.toLowerCase()}@prueba.sv`,
    ]);
    await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, true)",
      [id, carga.empresaId, rol],
    );
  }

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

describe("el formato se elige al generar el estado (S3-T25)", () => {
  it("sin pedir uno usa el de la empresa: de clase por defecto", async () => {
    expect((await resultados()).cuerpo).toMatchObject({ formato: "clase", titulo: "Estado de resultados" });
    expect((await balance()).cuerpo).toMatchObject({ formato: "clase", titulo: "Balance general" });
  });

  it("el formato pedido manda sobre el de la empresa", async () => {
    expect((await resultados("niif_pymes")).cuerpo).toMatchObject({
      formato: "niif_pymes",
      titulo: "Estado del resultado integral",
    });
    expect((await balance("niif_pymes")).cuerpo).toMatchObject({
      formato: "niif_pymes",
      titulo: "Estado de situación financiera",
    });
    expect((await patrimonio("niif_pymes")).cuerpo.formato).toBe("niif_pymes");
  });

  it("si la empresa configura NIIF para las PYMES, ese es el que se usa sin pedir otro", async () => {
    await c.query("update empresas set formato_estados = 'niif_pymes' where id = $1", [carga.empresaId]);
    expect((await resultados()).cuerpo.formato).toBe("niif_pymes");
    expect((await balance()).cuerpo.titulo).toBe("Estado de situación financiera");
    expect((await resultados("clase")).cuerpo.formato).toBe("clase");
    await c.query("update empresas set formato_estados = 'clase' where id = $1", [carga.empresaId]);
  });

  it("rechaza un formato desconocido", async () => {
    expect((await resultados("ifrs")).status).toBe(400);
  });
});

describe("ambos formatos dan las mismas cifras (S3-T27)", () => {
  it("estado de resultados: todas las secciones, renglones y utilidades coinciden", async () => {
    const clase = (await resultados("clase")).cuerpo;
    const niif = (await resultados("niif_pymes")).cuerpo;
    for (const s of [
      "ventas",
      "costoVentas",
      "gastosOperacion",
      "otrosIngresos",
      "otrosGastos",
      "impuestoRenta",
    ] as const) {
      expect(cifrasDe(niif[s])).toEqual(cifrasDe(clase[s]));
    }
    for (const k of [
      "utilidadBruta",
      "utilidadOperacion",
      "utilidadAntesImpuesto",
      "utilidadNeta",
    ] as const) {
      expect(niif[k]).toBe(clase[k]);
    }
    expect(niif.utilidadNeta).toBe("7594.99");
  });

  it("balance general: cada sección, los totales y el cuadre coinciden", async () => {
    const clase = (await balance("clase")).cuerpo;
    const niif = (await balance("niif_pymes")).cuerpo;
    for (const s of [
      "activoCorriente",
      "activoNoCorriente",
      "pasivoCorriente",
      "pasivoNoCorriente",
      "patrimonio",
    ] as const) {
      expect(cifrasDe(niif[s])).toEqual(cifrasDe(clase[s]));
    }
    for (const k of [
      "totalActivo",
      "totalPasivo",
      "totalPasivoPatrimonio",
      "diferencia",
      "cuadra",
    ] as const) {
      expect(niif[k]).toBe(clase[k]);
    }
    expect(niif.cuadra).toBe(true);
  });

  it("estado de cambios en el patrimonio: mismos valores en cada renglón", async () => {
    const clase = (await patrimonio("clase")).cuerpo;
    const niif = (await patrimonio("niif_pymes")).cuerpo;
    expect(niif.columnas).toEqual(clase.columnas);
    expect(niif.renglones.map((r) => [r.id, r.valores, r.total])).toEqual(
      clase.renglones.map((r) => [r.id, r.valores, r.total]),
    );
    expect(niif.patrimonioFinal).toBe(clase.patrimonioFinal);
  });

  it("lo que cambia son los nombres: el estado, sus secciones y los rótulos", async () => {
    const niif = (await resultados("niif_pymes")).cuerpo;
    expect(niif.ventas.titulo).toBe("Ingresos de actividades ordinarias");
    expect(niif.impuestoRenta.titulo).toBe("Gasto por impuesto a las ganancias");
    const bg = (await balance("niif_pymes")).cuerpo;
    expect([bg.activoCorriente.titulo, bg.pasivoNoCorriente.titulo]).toEqual([
      "Activos corrientes",
      "Pasivos no corrientes",
    ]);
    const pat = (await patrimonio("niif_pymes")).cuerpo;
    expect(pat.renglones.map((r) => r.concepto)).toContain("Saldo al final del período");
    expect((await patrimonio("clase")).cuerpo.renglones.map((r) => r.concepto)).toContain("Saldo final");
  });
});
