// Estado de resultados (HU-37) y balance general (HU-38) de punta a punta con el caso CheroPhonex.
// S2-T45: el estado de resultados coincide al centavo con la hoja de trabajo (sus columnas de resultados salen
// de la balanza ajustada). S2-T48: el activo es igual al pasivo más el patrimonio, antes y después del cierre.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type BalanceGeneral, type Balanza, type EstadoResultados } from "@contable/shared";
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
const AUXILIAR = "22222222-2222-4222-8222-222222222222"; // solo ve una sucursal sin movimientos
const AJENO = "33333333-3333-4333-8333-333333333333";

const esperado = leerCaso().esperado;
const monto = (valor: string) => Dinero.de(valor).aTexto();

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
let sucursalNueva: string;

async function pedir<T>(ruta: string, usuario = CONTADOR) {
  const r = await fetch(`${url}/empresas/${carga.empresaId}${ruta}`, {
    headers: { authorization: `Bearer ${usuario}` },
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}

const resultados = (query: string, usuario?: string) =>
  pedir<EstadoResultados>(`/estados/resultados?${query}`, usuario);
const balance = (query: string, usuario?: string) =>
  pedir<BalanceGeneral>(`/estados/balance-general?${query}`, usuario);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_estados");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c);
  const s = await c.query<{ id: string }>(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal Usulután', 'S002') returning id`,
    [carga.empresaId],
  );
  sucursalNueva = s.rows[0]!.id;

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
  const m = await c.query<{ id: string }>(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 3, false) returning id",
    [AUXILIAR, carga.empresaId],
  );
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    m.rows[0]!.id,
    sucursalNueva,
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

describe("estado de resultados de octubre de 2026 (S2-T42)", () => {
  let e: EstadoResultados;
  beforeAll(async () => {
    const r = await resultados("desde=2026-10-01&hasta=2026-10-31");
    expect(r.status).toBe(200);
    e = r.cuerpo;
  });

  it("ventas, costo de ventas y utilidad bruta coinciden con el ejercicio", () => {
    const ee = esperado.estadoDeResultados;
    expect(e.ventas.total).toBe(monto(ee.ventasNetas));
    expect(e.costoVentas.total).toBe(monto(ee.costoDeVentas));
    expect(e.utilidadBruta).toBe(monto(ee.utilidadBruta));
  });

  it("gastos de administración y de venta son los de operación; los financieros tienen renglón propio", () => {
    const ee = esperado.estadoDeResultados;
    expect(e.gastosOperacion.renglones).toEqual([
      { codigo: "4201", nombre: "Gastos de Administración", monto: monto(ee.gastosAdministracion) },
      { codigo: "4202", nombre: "Gastos de Venta", monto: monto(ee.gastosVenta) },
    ]);
    expect(e.gastosOperacion.total).toBe("4329.21");
    expect(e.utilidadOperacion).toBe("7609.99");
    expect(e.otrosGastos.renglones).toEqual([]);
    expect(e.costosFinancieros.renglones).toEqual([
      { codigo: "4203", nombre: "Costos Financieros", monto: monto(ee.gastosFinancieros) },
    ]);
  });

  it("utilidad neta: US$ 7,594.99 (sin otros ingresos, otros gastos ni impuesto; los financieros van aparte)", () => {
    expect(e.otrosIngresos.total).toBe("0.00");
    expect(e.otrosGastos.total).toBe("0.00");
    expect(e.costosFinancieros.total).toBe("15.00");
    expect(e.impuestoRenta.total).toBe("0.00");
    expect(e.utilidadNeta).toBe(monto(esperado.estadoDeResultados.utilidadNeta));
    expect(e.utilidadNeta).toBe("7594.99");
  });

  it("deja fuera las partidas de cierre (si no, las cuentas de resultado quedarían en cero)", () => {
    expect(e.ventas.total).not.toBe("0.00");
  });
});

describe("el estado de resultados coincide al centavo con la hoja de trabajo (S2-T45)", () => {
  // Las columnas de estado de resultados de la hoja de trabajo son los saldos de las cuentas de resultado
  // de la balanza ajustada: se comparan, cuenta de mayor por cuenta de mayor, con el estado.
  let ajustada: Balanza;
  let e: EstadoResultados;
  beforeAll(async () => {
    ajustada = (await pedir<Balanza>("/balanzas/ajustada?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
    e = (await resultados("desde=2026-10-01&hasta=2026-10-31")).cuerpo;
  });

  /** Columna de la hoja de trabajo por cuenta de mayor: saldo deudor menos acreedor de sus subcuentas. */
  const hojaDeTrabajo = () => {
    const porMayor = new Map<string, Dinero>();
    for (const l of ajustada.lineas.filter((l) => l.tipo === "ingresos" || l.tipo === "costos_gastos")) {
      const mayor = l.codigo.slice(0, 4);
      const neto = Dinero.de(l.saldoFinalDebe).menos(l.saldoFinalHaber);
      porMayor.set(mayor, (porMayor.get(mayor) ?? Dinero.cero()).mas(neto));
    }
    return porMayor;
  };

  it("cada renglón del estado es el saldo de su cuenta de mayor en la hoja de trabajo", () => {
    const hoja = hojaDeTrabajo();
    const renglones = [
      ...e.ventas.renglones,
      ...e.costoVentas.renglones,
      ...e.gastosOperacion.renglones,
      ...e.otrosIngresos.renglones,
      ...e.otrosGastos.renglones,
      ...e.costosFinancieros.renglones,
      ...e.impuestoRenta.renglones,
    ];
    expect(renglones.map((r) => r.codigo).sort()).toEqual(
      [...hoja.keys()].filter((k) => !hoja.get(k)!.esCero()).sort(),
    );
    for (const r of renglones) {
      const neto = hoja.get(r.codigo)!;
      // Los ingresos son acreedores: en el estado salen positivos
      const enHoja = r.codigo.startsWith("5") ? Dinero.cero().menos(neto) : neto;
      expect([r.codigo, r.monto]).toEqual([r.codigo, enHoja.aTexto()]);
    }
  });

  it("la utilidad neta es la diferencia entre las columnas de resultados de la hoja de trabajo", () => {
    const lineas = ajustada.lineas.filter((l) => l.tipo === "ingresos" || l.tipo === "costos_gastos");
    const acreedor = Dinero.sumar(lineas.map((l) => l.saldoFinalHaber));
    const deudor = Dinero.sumar(lineas.map((l) => l.saldoFinalDebe));
    expect(e.utilidadNeta).toBe(acreedor.menos(deudor).aTexto());
  });
});

describe("balance general (S2-T46 y S2-T48)", () => {
  it("al 31 de octubre coincide con el ejercicio y el activo es igual al pasivo más el patrimonio", async () => {
    const r = await balance("fecha=2026-10-31");
    expect(r.status).toBe(200);
    const b = r.cuerpo;
    const bg = esperado.balanceGeneral;
    expect(b).toMatchObject({
      fecha: "2026-10-31",
      sucursalId: null,
      totalActivo: monto(bg.totalActivo),
      totalPasivo: monto(bg.totalPasivo),
      patrimonio: { total: monto(bg.totalPatrimonio) },
      totalPasivoPatrimonio: monto(bg.totalActivo),
      diferencia: "0.00",
      cuadra: true,
    });
    expect(b.patrimonio.renglones).toEqual([
      { codigo: "3101", nombre: "Capital", monto: monto(bg.capital) },
      { codigo: "3106", nombre: "Utilidad del Ejercicio", monto: monto(bg.utilidadDelEjercicio) },
    ]);
  });

  it("separa el activo corriente del no corriente, con la depreciación restando", async () => {
    const b = (await balance("fecha=2026-10-31")).cuerpo;
    expect(b.activoNoCorriente.renglones).toEqual([
      { codigo: "1201", nombre: "Propiedad, Planta y Equipo", monto: "2500.00" },
      { codigo: "1202", nombre: "(R) Depreciaciones", monto: "-104.17" },
    ]);
    expect(Dinero.de(b.activoCorriente.total).mas(b.activoNoCorriente.total).aTexto()).toBe(b.totalActivo);
  });

  it.each(["2026-10-01", "2026-10-15", "2026-10-30"])(
    "al %s, antes del cierre, también cuadra con la utilidad del ejercicio en curso",
    async (fecha) => {
      const b = (await balance(`fecha=${fecha}`)).cuerpo;
      expect([b.diferencia, b.cuadra]).toEqual(["0.00", true]);
    },
  );

  it("antes del cierre la utilidad aparece como del ejercicio en curso", async () => {
    const b = (await balance("fecha=2026-10-30")).cuerpo;
    expect(b.patrimonio.renglones.find((r) => r.codigo === "")).toMatchObject({
      nombre: "Utilidad del ejercicio en curso",
    });
    expect(b.patrimonio.renglones.find((r) => r.codigo === "3106")).toBeUndefined();
  });
});

describe("por sucursal o consolidado, permisos y validación", () => {
  it("la casa matriz, única sucursal con movimientos, da lo mismo que el consolidado", async () => {
    const porSucursal = (await resultados(`desde=2026-10-01&hasta=2026-10-31&sucursalId=${carga.sucursalId}`))
      .cuerpo;
    expect(porSucursal.utilidadNeta).toBe("7594.99");
    expect(porSucursal.sucursalId).toBe(carga.sucursalId);
    const b = (await balance(`fecha=2026-10-31&sucursalId=${carga.sucursalId}`)).cuerpo;
    expect(b.totalActivo).toBe(monto(esperado.balanceGeneral.totalActivo));
  });

  it("una sucursal sin movimientos da estados en cero que cuadran", async () => {
    const e = (await resultados(`desde=2026-10-01&hasta=2026-10-31&sucursalId=${sucursalNueva}`)).cuerpo;
    expect(e.utilidadNeta).toBe("0.00");
    const b = (await balance(`fecha=2026-10-31&sucursalId=${sucursalNueva}`)).cuerpo;
    expect([b.totalActivo, b.cuadra]).toEqual(["0.00", true]);
  });

  it("quien está limitado a una sucursal solo suma la suya y no puede pedir otra (403)", async () => {
    const e = (await resultados("desde=2026-10-01&hasta=2026-10-31", AUXILIAR)).cuerpo;
    expect(e.utilidadNeta).toBe("0.00");
    const otra = await balance(`fecha=2026-10-31&sucursalId=${carga.sucursalId}`, AUXILIAR);
    expect(otra.status).toBe(403);
  });

  it("un usuario ajeno recibe 404", async () => {
    expect((await balance("fecha=2026-10-31", AJENO)).status).toBe(404);
  });

  it("400 con fechas inválidas o faltantes; 422 si la fecha no está en un ejercicio", async () => {
    expect((await resultados("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await balance("fecha=31/10/2026")).status).toBe(400);
    expect((await balance("")).status).toBe(400);
    expect((await balance("fecha=2025-12-31")).status).toBe(422);
    expect((await resultados("desde=2026-12-01&hasta=2027-01-31")).status).toBe(422);
  });
});
