// El caso CheroPhonex CON su partida n.º 37 (depreciación de octubre, US$ 104.17) ya cargado: el activo figura con su
// depreciación previa, generar octubre no la duplica y la depreciación continúa en noviembre sin cambiar el
// patrimonio de octubre (US$ 29,644.99).
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ActivoFijoVista,
  BalanceGeneral,
  CuadroActivo,
  ResultadoDepreciacion,
  VistaDepreciacionMes,
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
import { RELOJ } from "../src/modules/activo-fijo/domain/depreciacion.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const esperado = leerCaso().esperado;

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;

async function llamar<T>(metodo: "GET" | "POST", ruta: string, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${carga.empresaId}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${CONTADOR}`, "content-type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}
const balance = () => llamar<BalanceGeneral>("GET", "/estados/balance-general?fecha=2026-10-31");
const partidas = async () => Number((await c.query("select count(*) as n from partidas")).rows[0].n);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_depreciacion_caso");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c, leerCaso(), { activosFijos: true });
  await c.query("insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@prueba.sv')", [
    CONTADOR,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, carga.empresaId],
  );
  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RELOJ)
    .useValue(() => "2026-12-15")
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

describe("caso CheroPhonex con la partida de depreciación ya cargada", () => {
  it("el activo ya figura con su depreciación previa de octubre", async () => {
    const r = await llamar<ActivoFijoVista[]>("GET", "/activos-fijos");
    expect(r.cuerpo).toHaveLength(1);
    expect(r.cuerpo[0]).toMatchObject({
      codigo: "AF-0001",
      costo: "2500.00",
      depreciacionAcumulada: "104.17",
      valorEnLibros: "2395.83",
      ultimoMesDepreciado: "2026-10-01",
    });
  });

  it("octubre figura como generado y no se puede generar de nuevo (409): no se duplica a 208.34", async () => {
    const vista = (await llamar<VistaDepreciacionMes>("GET", "/depreciacion?mes=2026-10")).cuerpo;
    expect(vista.activos[0]).toMatchObject({ estado: "generada", cuota: "104.17" });
    expect(vista.partidas).toEqual([]);
    const antes = await partidas();
    expect((await llamar<ResultadoDepreciacion>("POST", "/depreciacion", { mes: "2026-10" })).status).toBe(
      409,
    );
    expect(await partidas()).toBe(antes);
    const b = (await balance()).cuerpo;
    expect(b.patrimonio.total).toBe("29644.99");
    expect(b.totalActivo).toBe(esperado.balanceGeneral.totalActivo);
    expect(b.cuadra).toBe(true);
  });

  it("noviembre es el siguiente mes: genera US$ 104.17 y el patrimonio de octubre no cambia", async () => {
    const r = await llamar<ResultadoDepreciacion>("POST", "/depreciacion", { mes: "2026-11" });
    expect(r.status).toBe(201);
    expect(r.cuerpo.total).toBe("104.17");
    const activo = (await llamar<ActivoFijoVista[]>("GET", "/activos-fijos")).cuerpo[0];
    expect(activo?.depreciacionAcumulada).toBe("208.34");
    expect((await balance()).cuerpo.patrimonio.total).toBe("29644.99");
  });

  it("el cuadro marca octubre como generado aunque su partida sea la del caso", async () => {
    const id = (await llamar<ActivoFijoVista[]>("GET", "/activos-fijos")).cuerpo[0]!.id;
    const filas = (await llamar<CuadroActivo>("GET", `/activos-fijos/${id}/cuadro`)).cuerpo.filas;
    expect(filas.slice(0, 3).map((f) => [f.mes, f.estado])).toEqual([
      ["2026-10-01", "generada"],
      ["2026-11-01", "generada"],
      ["2026-12-01", "pendiente"],
    ]);
  });

  it("registrar un activo con depreciación previa valida que coincida con el cuadro (400)", async () => {
    const base = {
      nombre: "Equipo anterior",
      categoria: "mobiliario_equipo",
      sucursalId: carga.sucursalId,
      costo: "1200.00",
      fechaAdquisicion: "2026-06-01",
      vidaUtilAnios: 2,
    };
    expect(
      (
        await llamar("POST", "/activos-fijos", {
          ...base,
          depreciacionAcumulada: "50.00",
          ultimoMesDepreciado: "2026-06",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await llamar("POST", "/activos-fijos", {
          ...base,
          depreciacionAcumulada: "99.00",
          ultimoMesDepreciado: "2026-06",
        })
      ).status,
    ).toBe(400);
    expect((await llamar("POST", "/activos-fijos", { ...base, depreciacionAcumulada: "50.00" })).status).toBe(
      400,
    );
  });
});
