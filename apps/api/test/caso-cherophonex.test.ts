// Caso CheroPhonex (HU-90, S2-T50): el sistema debe producir exactamente los resultados del ejercicio.
//
// Los datos y los resultados esperados salen del modelo del ejercicio (packages/db/src/casos/cherophonex.json),
// que los calcula de forma independiente del sistema. Esta prueba carga las 44 partidas y compara, al centavo,
// las tres balanzas de comprobación, el estado de resultados y el balance general. Corre en cada pull request.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type Balanza, type HojaTrabajo, type TipoBalanza } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cargarCasoCherophonex,
  leerCaso,
  type BalanzaEsperada,
  type CasoCargado,
} from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const DESDE = "2026-10-01";
const HASTA = "2026-10-31";

const caso = leerCaso();
const esperado = caso.esperado;

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
const balanzas = {} as Record<TipoBalanza, Balanza>;
let hoja: HojaTrabajo;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_cherophonex");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c);
  await c.query("insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@prueba.sv')", [
    CONTADOR,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, carga.empresaId],
  );

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

  for (const tipo of ["antes-ajustes", "ajustada", "posterior-cierre"] as const) {
    const r = await fetch(
      `${url}/empresas/${carga.empresaId}/balanzas/${tipo}?desde=${DESDE}&hasta=${HASTA}`,
      {
        headers: { authorization: `Bearer ${CONTADOR}` },
      },
    );
    expect(r.status, tipo).toBe(200);
    balanzas[tipo] = (await r.json()) as Balanza;
  }

  const h = await fetch(`${url}/empresas/${carga.empresaId}/hoja-trabajo?desde=${DESDE}&hasta=${HASTA}`, {
    headers: { authorization: `Bearer ${CONTADOR}` },
  });
  expect(h.status).toBe(200);
  hoja = (await h.json()) as HojaTrabajo;
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

/** Texto con dos decimales, para comparar montos sin depender de cómo se escribieron ("0" o "0.00"). */
const monto = (valor: string) => Dinero.de(valor).aTexto();

/** Lo que muestra la balanza por cuenta: [debe, haber, saldo deudor, saldo acreedor]. */
const obtenido = (b: Balanza) =>
  Object.fromEntries(
    b.lineas.map((l) => [
      l.codigo,
      [l.movimientoDebe, l.movimientoHaber, l.saldoFinalDebe, l.saldoFinalHaber],
    ]),
  );

const esperadoPor = (b: BalanzaEsperada) =>
  Object.fromEntries(
    Object.entries(b.cuentas).map(([codigo, v]) => [
      codigo,
      [monto(v.debe), monto(v.haber), monto(v.saldoDeudor), monto(v.saldoAcreedor)],
    ]),
  );

/** Saldo (deudor menos acreedor, o al revés) de las cuentas cuyo código empieza con alguno de los prefijos. */
function saldoDe(b: Balanza, prefijos: string[], naturaleza: "deudora" | "acreedora"): string {
  const lineas = b.lineas.filter((l) => prefijos.some((p) => l.codigo.startsWith(p)));
  const deudor = Dinero.sumar(lineas.map((l) => l.saldoFinalDebe));
  const acreedor = Dinero.sumar(lineas.map((l) => l.saldoFinalHaber));
  return (naturaleza === "deudora" ? deudor.menos(acreedor) : acreedor.menos(deudor)).aTexto();
}

describe("balanzas de comprobación de octubre de 2026", () => {
  it.each(["antes-ajustes", "ajustada", "posterior-cierre"] as const)(
    "balanza %s: cada cuenta coincide al centavo con el ejercicio",
    (tipo) => {
      expect(obtenido(balanzas[tipo])).toEqual(esperadoPor(esperado.balanzas[tipo]));
    },
  );

  it.each(["antes-ajustes", "ajustada", "posterior-cierre"] as const)(
    "balanza %s: los totales coinciden y el debe es igual al haber",
    (tipo) => {
      const b = balanzas[tipo];
      const t = esperado.balanzas[tipo].totales;
      expect(b.totales).toMatchObject({
        movimientoDebe: monto(t.debe),
        movimientoHaber: monto(t.haber),
        saldoFinalDebe: monto(t.saldoDeudor),
        saldoFinalHaber: monto(t.saldoAcreedor),
      });
      expect(b.cuadra).toBe(true);
      expect(b.diferencias).toEqual({ saldoInicial: "0.00", movimientos: "0.00", saldoFinal: "0.00" });
    },
  );

  it("posterior al cierre, las cuentas de resultado quedan en cero", () => {
    const resultado = balanzas["posterior-cierre"].lineas.filter((l) => /^[456]/.test(l.codigo));
    expect(resultado.length).toBeGreaterThan(0);
    for (const l of resultado) {
      expect([l.codigo, l.saldoFinalDebe, l.saldoFinalHaber]).toEqual([l.codigo, "0.00", "0.00"]);
    }
  });
});

describe("estado de resultados de octubre (desde la balanza ajustada)", () => {
  // Las cuentas de ingreso empiezan con 5; el costo de ventas es 4104 y los gastos, 4201, 4202 y 4203.
  const ajustada = () => balanzas["ajustada"];
  const e = esperado.estadoDeResultados;

  it("ventas, costo de ventas y utilidad bruta", () => {
    const ventas = saldoDe(ajustada(), ["51"], "acreedora");
    const costo = saldoDe(ajustada(), ["4104"], "deudora");
    expect(ventas).toBe(monto(e.ventasNetas));
    expect(costo).toBe(monto(e.costoDeVentas));
    expect(Dinero.de(ventas).menos(costo).aTexto()).toBe(monto(e.utilidadBruta));
  });

  it("gastos de administración, de venta y financieros", () => {
    expect(saldoDe(ajustada(), ["4201"], "deudora")).toBe(monto(e.gastosAdministracion));
    expect(saldoDe(ajustada(), ["4202"], "deudora")).toBe(monto(e.gastosVenta));
    expect(saldoDe(ajustada(), ["4203"], "deudora")).toBe(monto(e.gastosFinancieros));
  });

  it("utilidad neta: US$ 7,594.99", () => {
    const b = ajustada();
    const utilidad = Dinero.de(saldoDe(b, ["51"], "acreedora")).menos(saldoDe(b, ["4"], "deudora"));
    expect(utilidad.aTexto()).toBe(monto(e.utilidadNeta));
    expect(utilidad.aTexto()).toBe("7594.99");
  });
});

describe("balance general al 31 de octubre (desde la balanza posterior al cierre)", () => {
  const cierre = () => balanzas["posterior-cierre"];
  const bg = esperado.balanceGeneral;

  it("activo, pasivo y patrimonio", () => {
    expect(saldoDe(cierre(), ["1"], "deudora")).toBe(monto(bg.totalActivo));
    expect(saldoDe(cierre(), ["2"], "acreedora")).toBe(monto(bg.totalPasivo));
    expect(saldoDe(cierre(), ["3"], "acreedora")).toBe(monto(bg.totalPatrimonio));
  });

  it("activo igual a pasivo más patrimonio", () => {
    const activo = saldoDe(cierre(), ["1"], "deudora");
    const pasivoMasPatrimonio = Dinero.de(saldoDe(cierre(), ["2"], "acreedora")).mas(
      saldoDe(cierre(), ["3"], "acreedora"),
    );
    expect(activo).toBe(pasivoMasPatrimonio.aTexto());
  });

  it("capital y utilidad del ejercicio; la utilidad más los retiros del titular es la utilidad neta", () => {
    expect(saldoDe(cierre(), ["3101"], "acreedora")).toBe(monto(bg.capital));
    expect(saldoDe(cierre(), ["3106"], "acreedora")).toBe(monto(bg.utilidadDelEjercicio));
    // el cierre liquida los retiros (3108) contra la utilidad: 7,594.99 − 450.00 = 7,144.99
    expect(Dinero.de(bg.utilidadDelEjercicio).mas("450.00").aTexto()).toBe(
      monto(esperado.estadoDeResultados.utilidadNeta),
    );
  });
});

describe("la balanza por sucursal", () => {
  it("la casa matriz, única sucursal del caso, suma lo mismo que la consolidada", async () => {
    const r = await fetch(
      `${url}/empresas/${carga.empresaId}/balanzas/posterior-cierre?desde=${DESDE}&hasta=${HASTA}&sucursalId=${carga.sucursalId}`,
      { headers: { authorization: `Bearer ${CONTADOR}` } },
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as Balanza).totales).toEqual(balanzas["posterior-cierre"].totales);
  });
});

describe("hoja de trabajo de octubre: la utilidad cuadra entre las dos últimas secciones (S2-T36)", () => {
  const e = esperado.estadoDeResultados;
  const cuentas = () => hoja.lineas.filter((l) => l.resultado === null);
  const suma = (
    campo: "estadoResultadosDebe" | "estadoResultadosHaber" | "balanceGeneralDebe" | "balanceGeneralHaber",
  ) => Dinero.sumar(cuentas().map((l) => l[campo])).aTexto();

  it("el resultado del ejercicio es la utilidad esperada: US$ 7,594.99", () => {
    expect(hoja.resultado).toEqual({ tipo: "utilidad", monto: monto(e.utilidadNeta) });
    expect(hoja.lineas.filter((l) => l.resultado !== null)).toHaveLength(1);
  });

  it("antes de la utilidad, el estado de resultados tiene ventas en el haber y costos y gastos en el debe", () => {
    expect(suma("estadoResultadosHaber")).toBe(monto(e.ventasNetas));
    const costosYGastos = Dinero.sumar([
      e.costoDeVentas,
      e.gastosAdministracion,
      e.gastosVenta,
      e.gastosFinancieros,
    ]).aTexto();
    expect(suma("estadoResultadosDebe")).toBe(costosYGastos);
  });

  it("antes de la utilidad, ambas secciones difieren exactamente en la utilidad, cada una del lado contrario", () => {
    const utilidad = monto(e.utilidadNeta);
    expect(Dinero.de(suma("estadoResultadosHaber")).menos(suma("estadoResultadosDebe")).aTexto()).toBe(
      utilidad,
    );
    expect(Dinero.de(suma("balanceGeneralDebe")).menos(suma("balanceGeneralHaber")).aTexto()).toBe(utilidad);
  });

  it("la línea de utilidad va en el debe del estado de resultados y en el haber del balance general", () => {
    const linea = hoja.lineas.find((l) => l.resultado === "utilidad");
    expect(linea).toMatchObject({
      estadoResultadosDebe: monto(e.utilidadNeta),
      estadoResultadosHaber: "0.00",
      balanceGeneralDebe: "0.00",
      balanceGeneralHaber: monto(e.utilidadNeta),
    });
  });

  it("con la línea de utilidad, cada sección cuadra y no hay diferencias", () => {
    expect(hoja.totales.estadoResultadosDebe).toBe(hoja.totales.estadoResultadosHaber);
    expect(hoja.totales.balanceGeneralDebe).toBe(hoja.totales.balanceGeneralHaber);
    expect(hoja.diferencias).toEqual({
      balanza: "0.00",
      ajustes: "0.00",
      balanzaAjustada: "0.00",
      estadoResultados: "0.00",
      balanceGeneral: "0.00",
    });
    expect(hoja.cuadra).toBe(true);
  });

  it("la balanza y la balanza ajustada de la hoja coinciden con las balanzas de comprobación", () => {
    expect(hoja.totales.balanzaDebe).toBe(balanzas["antes-ajustes"].totales.saldoFinalDebe);
    expect(hoja.totales.balanzaHaber).toBe(balanzas["antes-ajustes"].totales.saldoFinalHaber);
    expect(hoja.totales.balanzaAjustadaDebe).toBe(balanzas["ajustada"].totales.saldoFinalDebe);
    expect(hoja.totales.balanzaAjustadaHaber).toBe(balanzas["ajustada"].totales.saldoFinalHaber);
  });

  it("los ajustes del mes cuadran y cada fila cumple balanza más ajustes igual a balanza ajustada", () => {
    expect(hoja.totales.ajustesDebe).toBe(hoja.totales.ajustesHaber);
    expect(Dinero.de(hoja.totales.ajustesDebe).esCero()).toBe(false);
    for (const l of cuentas()) {
      const antes = Dinero.de(l.balanzaDebe).menos(l.balanzaHaber);
      const ajuste = Dinero.de(l.ajustesDebe).menos(l.ajustesHaber);
      const ajustada = Dinero.de(l.balanzaAjustadaDebe).menos(l.balanzaAjustadaHaber);
      expect([l.codigo, antes.mas(ajuste).aTexto()]).toEqual([l.codigo, ajustada.aTexto()]);
    }
  });
});
