// Notas a los estados financieros (HU-44, S3-T31 y S3-T33) de punta a punta con el caso CheroPhonex: las cifras
// que llena el sistema coinciden con el balance, y los textos se guardan, se versionan y quedan en la bitácora.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type BalanceGeneral, type NotasEstados, type VersionNota } from "@contable/shared";
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

async function pedir<T>(ruta: string, usuario = CONTADOR, metodo = "GET", cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${carga.empresaId}${ruta}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${usuario}`,
      ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}

const notas = (query = "desde=2026-10-01&hasta=2026-10-31", usuario?: string) =>
  pedir<NotasEstados>(`/estados/notas?${query}`, usuario);
const guardar = (clave: string, texto: string, usuario = CONTADOR, fecha = "2026-10-31") =>
  pedir<{ clave: string; version: number }>(`/estados/notas/${clave}`, usuario, "PUT", { fecha, texto });
const versiones = (clave: string, usuario?: string) =>
  pedir<VersionNota[]>(`/estados/notas/${clave}/versiones?fecha=2026-10-31`, usuario);
const campo = (n: NotasEstados, clave: string, nombre: string) =>
  n.notas.find((x) => x.clave === clave)?.campos.find((c) => c.nombre === nombre)?.valor;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_notas");
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

describe("cifras de las notas de octubre de 2026 (S3-T31)", () => {
  let n: NotasEstados;
  beforeAll(async () => {
    const r = await notas();
    expect(r.status).toBe(200);
    n = r.cuerpo;
  });

  it("entrega las siete notas con el texto sugerido con los datos de CheroPhonex", () => {
    expect(n.ejercicioAnio).toBe(2026);
    expect(n.notas.map((x) => x.clave)).toEqual([
      "entidad",
      "politicas",
      "efectivo",
      "inventarios",
      "activo-fijo",
      "obligaciones",
      "capital",
    ]);
    const entidad = n.notas[0]!;
    expect(entidad.textoSugerido).toContain("CHERO PHONEX es una persona natural");
    expect(entidad.texto).toBe(entidad.textoSugerido);
    expect(entidad.version).toBeNull();
    expect(n.notas[1]!.textoSugerido).toContain("costo promedio ponderado");
  });

  it("el efectivo coincide con el balance general: caja chica, bancos y total US$ 22,270.89", async () => {
    const bg = (await pedir<BalanceGeneral>("/estados/balance-general?fecha=2026-10-31")).cuerpo;
    const efectivo = bg.activoCorriente.renglones.find((r) => r.codigo === "1101")?.monto;
    expect(campo(n, "efectivo", "Total")).toBe(efectivo);
    expect(campo(n, "efectivo", "Total")).toBe("22270.89");
    expect(campo(n, "efectivo", "Caja chica")).toBe("200.00");
    expect(campo(n, "efectivo", "Bancos")).toBe("22070.89");
  });

  it("inventarios, activo fijo y obligaciones llevan las cifras del caso", () => {
    expect(campo(n, "inventarios", "Inventario final")).toBe("5888.00");
    expect(campo(n, "inventarios", "Entradas del período")).toBe("40000.00");
    expect(campo(n, "inventarios", "Salidas del período")).toBe("34112.00");
    expect(campo(n, "activo-fijo", "Costo")).toBe("2500.00");
    expect(campo(n, "activo-fijo", "Depreciación acumulada")).toBe("104.17");
    expect(campo(n, "activo-fijo", "Valor en libros")).toBe("2395.83");
    expect(campo(n, "obligaciones", "Retenciones por pagar")).toBe("246.02");
    expect(campo(n, "obligaciones", "Obligaciones con empleados")).toBe("620.04");
    expect(campo(n, "obligaciones", "Impuestos por pagar")).toBe("1449.57");
    expect(campo(n, "obligaciones", "Total")).toBe("2315.63");
  });

  it("el capital es el del balance y lo forman las seis cuentas de los socios", async () => {
    expect(campo(n, "capital", "Capital total")).toBe(monto(esperado.balanceGeneral.capital));
    expect(campo(n, "capital", "Cuentas de capital")).toBe("6");
    expect(n.notas.find((x) => x.clave === "capital")?.tabla?.renglones).toHaveLength(7);
  });

  it("todas las tablas terminan en una fila de total que suma las anteriores", () => {
    for (const nota of n.notas) {
      if (!nota.tabla || nota.clave === "activo-fijo") continue;
      const total = nota.tabla.renglones.at(-1)!;
      expect(total.total).toBe(true);
      const suma = Dinero.sumar(nota.tabla.renglones.slice(0, -1).map((r) => r.valores.at(-1)!));
      expect(suma.aTexto()).toBe(total.valores.at(-1));
    }
  });
});

describe("textos de las notas: se guardan y se versionan (S3-T33)", () => {
  it("guarda una versión y la nota vigente pasa a usar ese texto", async () => {
    const r = await guardar("capital", "El capital lo forman seis socios en partes iguales.");
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({ clave: "capital", version: 1 });
    const n = (await notas()).cuerpo.notas.find((x) => x.clave === "capital")!;
    expect(n.texto).toBe("El capital lo forman seis socios en partes iguales.");
    expect(n.editada).toBe(true);
    expect(n.version).toBe(1);
    // Las cifras siguen saliendo de la contabilidad, no del texto
    expect(n.campos.find((c) => c.nombre === "Capital total")?.valor).toBe("22500.00");
  });

  it("cada guardado agrega una versión y el historial las lista de la más reciente a la más antigua", async () => {
    expect((await guardar("capital", "Segunda redacción.")).cuerpo.version).toBe(2);
    expect((await guardar("capital", "Tercera redacción.")).cuerpo.version).toBe(3);
    const h = (await versiones("capital")).cuerpo;
    expect(h.map((v) => [v.version, v.texto])).toEqual([
      [3, "Tercera redacción."],
      [2, "Segunda redacción."],
      [1, "El capital lo forman seis socios en partes iguales."],
    ]);
    expect(h[0]!.autor).toBe("Contador");
    expect((await notas()).cuerpo.notas.find((x) => x.clave === "capital")?.version).toBe(3);
  });

  it("el texto es del ejercicio: otro período del mismo ejercicio lo ve igual", async () => {
    const n = (await notas("desde=2026-10-15&hasta=2026-10-20")).cuerpo.notas.find(
      (x) => x.clave === "capital",
    );
    expect(n?.texto).toBe("Tercera redacción.");
  });

  it("registra en la bitácora quién redactó cada versión", async () => {
    const b = await c.query(
      `select usuario_id, accion from bitacora where tabla = 'notas_estados' and empresa_id = $1 order by id`,
      [carga.empresaId],
    );
    expect(b.rows).toHaveLength(3);
    expect(new Set(b.rows.map((f) => f.usuario_id))).toEqual(new Set([CONTADOR]));
  });

  it("recorta los espacios del texto y rechaza uno vacío o demasiado largo", async () => {
    expect((await guardar("efectivo", "  Con espacios.  ")).status).toBe(200);
    expect((await versiones("efectivo")).cuerpo[0]?.texto).toBe("Con espacios.");
    expect((await guardar("efectivo", "   ")).status).toBe(400);
    expect((await guardar("efectivo", "a".repeat(5001))).status).toBe(400);
  });
});

describe("permisos y filtros de las notas", () => {
  it("un usuario ajeno a la empresa recibe 404 al consultar y al guardar", async () => {
    expect((await notas(undefined, AJENO)).status).toBe(404);
    expect((await guardar("entidad", "Intento", AJENO)).status).toBe(404);
  });

  it("un auxiliar puede ver las notas pero no redactarlas", async () => {
    expect((await notas(undefined, AUXILIAR)).status).toBe(200);
    expect((await versiones("capital", AUXILIAR)).status).toBe(200);
    expect((await guardar("entidad", "No puede", AUXILIAR)).status).toBe(403);
    const v = await c.query(`select count(*)::int as n from notas_estados where clave = 'entidad'`);
    expect(v.rows[0].n).toBe(0);
  });

  it("rechaza una nota que no existe, fechas inválidas y fechas fuera de todo ejercicio", async () => {
    expect((await guardar("inventada", "x")).status).toBe(400);
    expect((await notas("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await notas("desde=2026-10-01&hasta=2027-01-31")).status).toBe(422);
    expect((await guardar("entidad", "x", CONTADOR, "2031-01-15")).status).toBe(422);
  });

  it("un auxiliar de otra sucursal ve las notas con las cifras de lo suyo: sin movimientos, efectivo en cero", async () => {
    const n = (await notas(undefined, AUXILIAR)).cuerpo;
    expect(campo(n, "efectivo", "Total")).toBe("0.00");
  });
});
