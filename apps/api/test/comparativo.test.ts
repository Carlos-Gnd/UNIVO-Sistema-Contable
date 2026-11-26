// Estados comparativos (HU-43, S3-T30) con el caso CheroPhonex: la variación es la diferencia exacta entre
// períodos y cada período coincide con el estado simple de su fecha.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type BalanceGeneral, type EstadoComparativo, type EstadoResultados } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarCasoCherophonex, type CasoCargado } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AJENO = "33333333-3333-4333-8333-333333333333";

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

const comparar = (query: string, usuario?: string) =>
  pedir<EstadoComparativo>(`/estados/comparativo?${query}`, usuario);

const OCT = "desdeA=2026-10-01&hastaA=2026-10-31";
const PRIMERA_QUINCENA = "desdeB=2026-10-01&hastaB=2026-10-15";

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_comparativo");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c);
  await c.query("insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@prueba.sv')", [
    CONTADOR,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, carga.empresaId],
  );
  await c.query("insert into usuarios (id, nombre, correo) values ($1, 'Ajeno', 'ajeno@prueba.sv')", [AJENO]);

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

describe("comparativo del estado de resultados: octubre frente a su primera quincena (S3-T30)", () => {
  let cmp: EstadoComparativo;
  let octubre: EstadoResultados;
  let quincena: EstadoResultados;
  beforeAll(async () => {
    const r = await comparar(`estado=resultados&${OCT}&${PRIMERA_QUINCENA}`);
    expect(r.status).toBe(200);
    cmp = r.cuerpo;
    octubre = (await pedir<EstadoResultados>("/estados/resultados?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
    quincena = (await pedir<EstadoResultados>("/estados/resultados?desde=2026-10-01&hasta=2026-10-15"))
      .cuerpo;
  });

  it("cada período coincide con el estado de resultados de ese período", () => {
    const fila = (id: string) => cmp.filas.find((f) => f.id === id)!;
    expect(fila("ventas:total")).toMatchObject({
      periodoA: octubre.ventas.total,
      periodoB: quincena.ventas.total,
    });
    expect(fila("utilidadNeta")).toMatchObject({ periodoA: "7594.99", periodoB: quincena.utilidadNeta });
    expect(fila("utilidadBruta").periodoA).toBe(octubre.utilidadBruta);
    expect(fila("utilidadOperacion").periodoB).toBe(quincena.utilidadOperacion);
  });

  it("la variación de cada fila es la diferencia exacta entre los dos períodos", () => {
    const filas = cmp.filas.filter((f) => f.tipo !== "seccion");
    expect(filas.length).toBeGreaterThan(8);
    for (const f of filas) {
      expect(f.variacion, f.id).toBe(Dinero.de(f.periodoA!).menos(f.periodoB!).aTexto());
    }
  });

  it("el porcentaje es la variación entre el período B, y n/a si el período B está en cero", () => {
    const ventas = cmp.filas.find((f) => f.id === "ventas:total")!;
    const esperado = Dinero.de(ventas.variacion!).por(100);
    expect(Number(ventas.porcentaje)).toBeCloseTo(Number(esperado.aTexto()) / Number(ventas.periodoB), 1);
    for (const f of cmp.filas.filter((f) => f.tipo !== "seccion" && Dinero.de(f.periodoB!).esCero())) {
      expect(f.porcentaje, f.id).toBeNull();
    }
  });

  it("cada cuenta de mayor del estado de octubre aparece en el comparativo con su monto", () => {
    for (const r of octubre.gastosOperacion.renglones) {
      expect(cmp.filas.find((f) => f.id === `gastosOperacion:${r.codigo}`)).toMatchObject({
        codigo: r.codigo,
        periodoA: r.monto,
      });
    }
  });

  it("devuelve el estado y los períodos pedidos", () => {
    expect(cmp).toMatchObject({
      estado: "resultados",
      formato: "clase",
      titulo: "Estado de resultados",
      sucursalId: null,
      periodoA: { desde: "2026-10-01", hasta: "2026-10-31" },
      periodoB: { desde: "2026-10-01", hasta: "2026-10-15" },
    });
  });
});

describe("octubre frente a septiembre: la empresa no tenía movimientos", () => {
  it("la base está en cero, así que la variación es todo el período y no hay porcentaje", async () => {
    const r = await comparar(`estado=resultados&${OCT}&desdeB=2026-09-01&hastaB=2026-09-30`);
    expect(r.status).toBe(200);
    const utilidad = r.cuerpo.filas.find((f) => f.id === "utilidadNeta")!;
    expect(utilidad).toMatchObject({
      periodoA: "7594.99",
      periodoB: "0.00",
      variacion: "7594.99",
      porcentaje: null,
    });
    for (const f of r.cuerpo.filas.filter((f) => f.tipo !== "seccion")) {
      expect(f.periodoB, f.id).toBe("0.00");
      expect(f.porcentaje, f.id).toBeNull();
    }
  });

  it("un período que cruza de ejercicio se rechaza con 422", async () => {
    const r = await comparar(`estado=resultados&${OCT}&desdeB=2026-12-01&hastaB=2027-01-31`);
    expect(r.status).toBe(422);
  });
});

describe("comparativo del balance general (S3-T30)", () => {
  it("la variación de cada fila es la diferencia exacta entre las dos fechas y el balance cuadra en ambas", async () => {
    const r = await comparar("estado=balance-general&hastaA=2026-10-31&hastaB=2026-10-15");
    expect(r.status).toBe(200);
    const cmp = r.cuerpo;
    expect(cmp).toMatchObject({
      estado: "balance-general",
      titulo: "Balance general",
      periodoA: { desde: null, hasta: "2026-10-31" },
      periodoB: { desde: null, hasta: "2026-10-15" },
    });
    for (const f of cmp.filas.filter((f) => f.tipo !== "seccion")) {
      expect(f.variacion, f.id).toBe(Dinero.de(f.periodoA!).menos(f.periodoB!).aTexto());
    }
    const fila = (id: string) => cmp.filas.find((f) => f.id === id)!;
    expect(fila("totalActivo").periodoA).toBe("31960.62");
    expect(fila("totalPasivoPatrimonio").periodoA).toBe("31960.62");
    // En cada fecha el activo es igual al pasivo más el patrimonio, así que sus variaciones también lo son
    expect(fila("totalActivo").variacion).toBe(fila("totalPasivoPatrimonio").variacion);
    const b = (await pedir<BalanceGeneral>("/estados/balance-general?fecha=2026-10-15")).cuerpo;
    expect(fila("totalActivo").periodoB).toBe(b.totalActivo);
  });
});

describe("formato, permisos y filtros del comparativo", () => {
  it("el formato NIIF cambia los nombres y deja las mismas cifras", async () => {
    const clase = (await comparar(`estado=balance-general&hastaA=2026-10-31&hastaB=2026-10-15`)).cuerpo;
    const niif = (
      await comparar(`estado=balance-general&hastaA=2026-10-31&hastaB=2026-10-15&formato=niif_pymes`)
    ).cuerpo;
    expect(niif.titulo).toBe("Estado de situación financiera");
    expect(niif.filas.map((f) => [f.id, f.periodoA, f.periodoB, f.variacion, f.porcentaje])).toEqual(
      clase.filas.map((f) => [f.id, f.periodoA, f.periodoB, f.variacion, f.porcentaje]),
    );
  });

  it("un usuario ajeno recibe 404", async () => {
    expect((await comparar(`estado=resultados&${OCT}&${PRIMERA_QUINCENA}`, AJENO)).status).toBe(404);
  });

  it("rechaza un estado desconocido y fechas incompletas o invertidas", async () => {
    expect((await comparar(`estado=flujo&${OCT}&${PRIMERA_QUINCENA}`)).status).toBe(400);
    expect((await comparar(`estado=resultados&hastaA=2026-10-31&hastaB=2026-10-15`)).status).toBe(400);
    expect(
      (await comparar(`estado=resultados&desdeA=2026-10-31&hastaA=2026-10-01&${PRIMERA_QUINCENA}`)).status,
    ).toBe(400);
  });
});
