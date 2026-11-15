// Pruebas por rol (HU-10, S1-T57): para cada rol del sistema, al menos un caso permitido y uno denegado,
// de punta a punta por HTTP contra los endpoints reales y la matriz de permisos de PostgreSQL.
//
// Cada caso declara el permiso que exige. Además de la respuesta esperada, la prueba verifica que la API
// coincida con la matriz de la base (vista permisos_usuario): si alguien cambia la matriz o un endpoint
// deja de revisar su permiso, falla aquí.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearPartida, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

/** Supabase simulado: "Bearer <id>" es un token válido de ese usuario. */
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

const ROLES = ["administrador", "contador", "auxiliar", "consulta"] as const;
type Rol = (typeof ROLES)[number];

const USUARIOS: Record<Rol | "ajeno" | "invitado", string> = {
  administrador: "a1111111-1111-4111-8111-111111111111",
  contador: "b2222222-2222-4222-8222-222222222222",
  auxiliar: "c3333333-3333-4333-8333-333333333333",
  consulta: "d4444444-4444-4444-8444-444444444444",
  ajeno: "e5555555-5555-4555-8555-555555555555", // sin membresía en la empresa
  invitado: "f6666666-6666-4666-8666-666666666666", // ya tiene perfil: invitarlo no llama a Supabase
};

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let empresaId: string;
/** Empresa que registró el contador: allí él es administrador y el administrador de la otra no es miembro */
let ajenaId: string;
let matrizId: string;
let surId: string;
const cuentas: Record<string, string> = {};
const permisosDe = new Map<Rol, Set<string>>();

async function pedir(metodo: string, ruta: string, usuario: string, cuerpo?: unknown | FormData) {
  const esForm = cuerpo instanceof FormData;
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${usuario}`,
      ...(cuerpo === undefined || esForm ? {} : { "content-type": "application/json" }),
    },
    body: cuerpo === undefined ? undefined : esForm ? cuerpo : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  return { status: r.status, cuerpo: (texto ? JSON.parse(texto) : null) as unknown };
}

/** Borrador cuadrado en la casa matriz, listo para contabilizar. */
const borrador = (fecha: string) =>
  crearPartida(c, { empresaId, sucursalId: matrizId, cuentas }, fecha, [
    [cuentas["110101"]!, "113.00", "0"],
    [cuentas["5101"]!, "0", "113.00"],
  ]);

const logoPng = () => {
  const form = new FormData();
  // PNG de 1×1 píxel
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  form.append("logo", new Blob([png], { type: "image/png" }), "logo.png");
  return form;
};

interface Caso {
  accion: string;
  /** Permiso de la matriz que exige el endpoint */
  permiso: string;
  rol: Rol;
  permitido: boolean;
  /** Respuesta de un caso denegado: 403 sin permiso; 404 en una empresa de la que no es miembro */
  denegado?: 403 | 404;
  /** true si el caso ocurre en otra empresa: allí el rol no tiene ningún permiso */
  enEmpresaAjena?: boolean;
  ejecutar: () => Promise<{ status: number; cuerpo: unknown }>;
}

const DENEGADO = 403;

/** Casos por rol. Las funciones se evalúan en cada prueba, cuando la empresa ya existe. */
function casos(): Caso[] {
  const como = (rol: Rol) => USUARIOS[rol];
  const lista: Caso[] = [];
  const agregar = (
    accion: string,
    permiso: string,
    permitidos: Rol[],
    ejecutar: (rol: Rol) => Promise<{ status: number; cuerpo: unknown }>,
    roles: readonly Rol[] = ROLES,
  ) => {
    for (const rol of roles) {
      lista.push({
        accion,
        permiso,
        rol,
        permitido: permitidos.includes(rol),
        ejecutar: () => ejecutar(rol),
      });
    }
  };

  agregar("consultar la empresa", "empresa.ver", [...ROLES], (rol) =>
    pedir("GET", `/empresas/${empresaId}`, como(rol)),
  );
  agregar("editar los datos de la empresa", "empresa.configurar", ["administrador"], (rol) =>
    pedir("PATCH", `/empresas/${empresaId}`, como(rol), { telefono: `2661-000${ROLES.indexOf(rol)}` }),
  );
  agregar("ver las sucursales", "sucursales.ver", [...ROLES], (rol) =>
    pedir("GET", `/empresas/${empresaId}/sucursales`, como(rol)),
  );
  agregar("crear una sucursal", "sucursales.gestionar", ["administrador"], (rol) =>
    pedir("POST", `/empresas/${empresaId}/sucursales`, como(rol), {
      nombre: `Sucursal de ${rol}`,
      codigoEstablecimiento: `S00${ROLES.indexOf(rol) + 2}`,
    }),
  );
  agregar("contabilizar una partida", "partidas.contabilizar", ["administrador", "contador"], async (rol) =>
    pedir(
      "POST",
      `/empresas/${empresaId}/partidas/${await borrador(`2026-0${ROLES.indexOf(rol) + 2}-10`)}/contabilizar`,
      como(rol),
    ),
  );
  agregar("invitar a un usuario", "usuarios.gestionar", ["administrador"], (rol) =>
    pedir("POST", `/empresas/${empresaId}/usuarios/invitaciones`, como(rol), {
      correo: "invitado@prueba.sv",
      rol: "contador",
    }),
  );
  // El administrador tiene todos los permisos de la matriz: lo que se le niega es actuar en otra empresa
  lista.push({
    accion: "editar una empresa de la que no es miembro",
    permiso: "empresa.configurar",
    rol: "administrador",
    permitido: false,
    denegado: 404,
    enEmpresaAjena: true,
    ejecutar: () => pedir("PATCH", `/empresas/${ajenaId}`, como("administrador"), { telefono: "1" }),
  });
  lista.push({
    accion: "ver las sucursales de una empresa de la que no es miembro",
    permiso: "sucursales.ver",
    rol: "administrador",
    permitido: false,
    denegado: 404,
    enEmpresaAjena: true,
    ejecutar: () => pedir("GET", `/empresas/${ajenaId}/sucursales`, como("administrador")),
  });
  // Subir el logotipo de verdad necesita Supabase Storage: aquí solo se prueban los roles que no pueden
  agregar(
    "subir el logotipo",
    "empresa.configurar",
    [],
    (rol) => pedir("POST", `/empresas/${empresaId}/logo`, como(rol), logoPng()),
    ["contador", "auxiliar", "consulta"],
  );
  return lista;
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_roles");
  c = await reiniciarBase(urlBase);
  for (const [nombre, id] of Object.entries(USUARIOS)) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${nombre}@prueba.sv`,
    ]);
  }

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue(authPrueba)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();

  // El administrador registra la empresa por la API: se crean su casa matriz, su catálogo y su membresía
  const r = await pedir("POST", "/empresas", USUARIOS.administrador, {
    nombre: "Comercial Oriente, S.A. de C.V.",
    nit: "0614-010190-101-5",
    tipoContribuyente: "sociedad",
  });
  empresaId = (r.cuerpo as { id: string }).id;
  matrizId = (await c.query("select id from sucursales where empresa_id = $1 and es_matriz", [empresaId]))
    .rows[0].id;
  surId = (
    await c.query(
      `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal Usulután', 'S001')
       returning id`,
      [empresaId],
    )
  ).rows[0].id;
  await c.query(
    "insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2026, '2026-01-01', '2026-12-31')",
    [empresaId],
  );
  for (const f of (
    await c.query("select codigo, id from cuentas where empresa_id = $1 and codigo in ('110101', '5101')", [
      empresaId,
    ])
  ).rows) {
    cuentas[f.codigo] = f.id;
  }

  // Contador: todas las sucursales. Auxiliar y consulta: solo la casa matriz (la base lo exige por rol).
  for (const [rol, rolId] of [
    ["contador", 2],
    ["auxiliar", 3],
    ["consulta", 4],
  ] as const) {
    const m = await c.query(
      `insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id`,
      [USUARIOS[rol], empresaId, rolId, rolId === 2],
    );
    if (rolId !== 2) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        m.rows[0].id,
        matrizId,
      ]);
    }
  }

  // El contador registra su propia empresa, donde queda como administrador
  const ajena = await pedir("POST", "/empresas", USUARIOS.contador, {
    nombre: "Ferretería del Contador",
    nit: "1234-567890-123-0",
    tipoContribuyente: "sociedad",
  });
  ajenaId = (ajena.cuerpo as { id: string }).id;

  for (const rol of ROLES) {
    const filas = await c.query<{ permiso: string }>(
      "select permiso from permisos_usuario where usuario_id = $1 and empresa_id = $2",
      [USUARIOS[rol], empresaId],
    );
    permisosDe.set(rol, new Set(filas.rows.map((f) => f.permiso)));
  }
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("matriz de permisos por rol (HU-10)", () => {
  for (const rol of ROLES) {
    describe(rol, () => {
      for (const caso of casos().filter((k) => k.rol === rol)) {
        it(`${caso.permitido ? "puede" : "no puede"} ${caso.accion} (${caso.permiso})`, async () => {
          // La expectativa coincide con la matriz de la base: el rol tiene el permiso si y solo si está permitido
          if (caso.enEmpresaAjena) {
            const enAjena = await c.query(
              "select 1 from permisos_usuario where usuario_id = $1 and empresa_id = $2",
              [USUARIOS[rol], ajenaId],
            );
            expect(enAjena.rowCount).toBe(0);
          } else {
            expect(permisosDe.get(rol)?.has(caso.permiso)).toBe(caso.permitido);
          }

          const r = await caso.ejecutar();
          if (caso.permitido) {
            expect(r.status, JSON.stringify(r.cuerpo)).toBeGreaterThanOrEqual(200);
            expect(r.status, JSON.stringify(r.cuerpo)).toBeLessThan(300);
          } else {
            expect(r.status, JSON.stringify(r.cuerpo)).toBe(caso.denegado ?? DENEGADO);
          }
        });
      }
    });
  }

  it("cada rol tiene al menos un caso permitido y uno denegado", () => {
    for (const rol of ROLES) {
      const propios = casos().filter((k) => k.rol === rol);
      expect(
        propios.some((k) => k.permitido),
        rol,
      ).toBe(true);
      expect(
        propios.some((k) => !k.permitido),
        rol,
      ).toBe(true);
    }
  });
});

describe("alcance de cada rol", () => {
  it("un usuario sin membresía no accede a la empresa", async () => {
    for (const [metodo, ruta] of [
      ["GET", `/empresas/${empresaId}`],
      ["GET", `/empresas/${empresaId}/sucursales`],
      ["PATCH", `/empresas/${empresaId}`],
    ] as const) {
      const r = await pedir(metodo, ruta, USUARIOS.ajeno, metodo === "PATCH" ? { telefono: "1" } : undefined);
      expect(r.status, `${metodo} ${ruta}`).toBe(404);
    }
    const contabilizar = await pedir(
      "POST",
      `/empresas/${empresaId}/partidas/${await borrador("2026-07-01")}/contabilizar`,
      USUARIOS.ajeno,
    );
    expect(contabilizar.status).toBe(404);
  });

  it("el rol es por empresa: el contador de una empresa administra la suya", async () => {
    expect(
      (await pedir("PATCH", `/empresas/${empresaId}`, USUARIOS.contador, { telefono: "1" })).status,
    ).toBe(DENEGADO);
    expect(
      (await pedir("PATCH", `/empresas/${ajenaId}`, USUARIOS.contador, { telefono: "2661-9999" })).status,
    ).toBe(200);
  });

  it("administrador y contador ven todas las sucursales; auxiliar y consulta, solo las asignadas", async () => {
    const ids = async (rol: Rol) =>
      ((await pedir("GET", `/empresas/${empresaId}/sucursales`, USUARIOS[rol])).cuerpo as { id: string }[])
        .map((s) => s.id)
        .sort();
    expect(await ids("administrador")).toEqual(expect.arrayContaining([matrizId, surId]));
    expect(await ids("contador")).toEqual(expect.arrayContaining([matrizId, surId]));
    expect(await ids("auxiliar")).toEqual([matrizId]);
    expect(await ids("consulta")).toEqual([matrizId]);
  });

  it("un rol denegado no deja cambios en la base", async () => {
    const antes = (await c.query("select telefono from empresas where id = $1", [empresaId])).rows[0]
      .telefono;
    expect(
      (await pedir("PATCH", `/empresas/${empresaId}`, USUARIOS.consulta, { telefono: "9999" })).status,
    ).toBe(DENEGADO);
    expect((await c.query("select telefono from empresas where id = $1", [empresaId])).rows[0].telefono).toBe(
      antes,
    );

    const id = await borrador("2026-08-01");
    expect(
      (await pedir("POST", `/empresas/${empresaId}/partidas/${id}/contabilizar`, USUARIOS.auxiliar)).status,
    ).toBe(DENEGADO);
    expect((await c.query("select estado, numero from partidas where id = $1", [id])).rows[0]).toEqual({
      estado: "borrador",
      numero: null,
    });
  });
});
