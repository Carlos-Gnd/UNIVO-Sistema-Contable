// Semilla con datos de prueba para desarrollo local (S1-T25).
//
//   pnpm --filter @contable/db seed
//
// Usa SEED_DATABASE_URL, o TEST_DATABASE_URL, o el contenedor local del puerto 54329. Nunca DATABASE_URL:
// así no se cargan datos de prueba por accidente en el proyecto de Supabase del equipo. Para una base remota
// hay que pasar SEED_DATABASE_URL y además SEED_PERMITIR_REMOTO=1.
//
// Es idempotente: si la empresa de demostración ya existe, no hace nada.
import pg from "pg";

const URL_LOCAL = "postgresql://postgres:postgres@localhost:54329/contable";

export const NIT_DEMO = "0614-150390-101-8";

/** Ids fijos para iniciar sesión con estos usuarios en desarrollo; uno por rol del sistema. */
export const USUARIOS_DEMO = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    nombre: "Ana Administradora",
    correo: "admin@ejemplo.com",
    rol: 1,
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    nombre: "Carlos Contador",
    correo: "contador@ejemplo.com",
    rol: 2,
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    nombre: "Ariel Auxiliar",
    correo: "auxiliar@ejemplo.com",
    rol: 3,
  },
  {
    id: "a0000000-0000-4000-8000-000000000004",
    nombre: "Conny Consulta",
    correo: "consulta@ejemplo.com",
    rol: 4,
  },
] as const;

const [ADMIN, CONTADOR, AUXILIAR] = USUARIOS_DEMO;

type Linea = [codigo: string, debe: string, haber: string];

interface PartidaDemo {
  fecha: string;
  tipo?: "apertura" | "operacion" | "ajuste" | "reversion";
  concepto: string;
  documento?: [tipo: string, numero: string];
  sucursal?: "matriz" | "usulutan";
  lineas: Linea[];
  /** borrador: la registra el auxiliar y queda pendiente; contabilizada: la contabiliza el contador */
  estado: "borrador" | "contabilizada";
}

// Operaciones del primer trimestre de 2026 de una sociedad comercial (IVA 13 %).
const PARTIDAS: PartidaDemo[] = [
  {
    fecha: "2026-01-02",
    tipo: "apertura",
    concepto: "Partida de apertura del ejercicio 2026",
    estado: "contabilizada",
    lineas: [
      ["110101", "5000.00", "0"],
      ["11010301", "20000.00", "0"],
      ["1109", "15000.00", "0"],
      ["3101", "0", "40000.00"],
    ],
  },
  {
    fecha: "2026-01-10",
    concepto: "Compra de mercadería al crédito a proveedor local",
    documento: ["CCF", "0001-00000123"],
    estado: "contabilizada",
    lineas: [
      ["1109", "2000.00", "0"],
      ["1112", "260.00", "0"],
      ["210201", "0", "2260.00"],
    ],
  },
  {
    fecha: "2026-01-15",
    concepto: "Venta al contado a consumidor final",
    documento: ["FAC", "0001-00000001"],
    estado: "contabilizada",
    lineas: [
      ["110101", "1130.00", "0"],
      ["5101", "0", "1000.00"],
      ["2109", "0", "130.00"],
    ],
  },
  {
    fecha: "2026-01-15",
    concepto: "Costo de la mercadería vendida",
    estado: "contabilizada",
    lineas: [
      ["4104", "600.00", "0"],
      ["1109", "0", "600.00"],
    ],
  },
  {
    fecha: "2026-02-05",
    concepto: "Pago a proveedor con cheque",
    documento: ["CHQ", "000451"],
    estado: "contabilizada",
    lineas: [
      ["210201", "2260.00", "0"],
      ["11010301", "0", "2260.00"],
    ],
  },
  {
    fecha: "2026-02-12",
    concepto: "Venta al crédito a contribuyente, sucursal Usulután",
    documento: ["CCF", "0002-00000001"],
    sucursal: "usulutan",
    estado: "contabilizada",
    lineas: [
      ["1103", "2260.00", "0"],
      ["5101", "0", "2000.00"],
      ["2109", "0", "260.00"],
    ],
  },
  {
    fecha: "2026-02-28",
    concepto: "Gastos de febrero pendientes de revisión",
    estado: "borrador",
    lineas: [
      ["4201", "350.00", "0"],
      ["4202", "150.00", "0"],
      ["11010301", "0", "500.00"],
    ],
  },
  {
    // Los borradores pueden guardarse descuadrados; aparece en la bandeja de pendientes
    fecha: "2026-03-03",
    concepto: "Venta en captura (descuadrada)",
    estado: "borrador",
    lineas: [
      ["110101", "100.00", "0"],
      ["5101", "0", "90.00"],
    ],
  },
];

/** Partida registrada por error que se anula con su reversión. */
const PARTIDA_ANULADA: PartidaDemo = {
  fecha: "2026-02-20",
  concepto: "Venta registrada dos veces por error",
  documento: ["FAC", "0001-00000001"],
  estado: "contabilizada",
  lineas: [
    ["110101", "1130.00", "0"],
    ["5101", "0", "1000.00"],
    ["2109", "0", "130.00"],
  ],
};

export interface ResultadoSemilla {
  creada: boolean;
  empresaId: string;
}

/** Carga los datos de demostración en una sola transacción. */
export async function sembrar(c: pg.Client): Promise<ResultadoSemilla> {
  const existente = await c.query<{ id: string }>(`select id from empresas where nit = $1`, [NIT_DEMO]);
  if (existente.rows[0]) return { creada: false, empresaId: existente.rows[0].id };

  const comoUsuario = (id: string) => c.query(`select set_config('app.usuario_id', $1, true)`, [id]);

  await c.query("begin");
  try {
    await comoUsuario(ADMIN.id);

    for (const u of USUARIOS_DEMO) {
      await c.query(
        `insert into usuarios (id, nombre, correo) values ($1, $2, $3) on conflict (id) do nothing`,
        [u.id, u.nombre, u.correo],
      );
    }

    const empresa = await c.query<{ id: string }>(
      `insert into empresas (nombre, nombre_comercial, nit, nrc, tipo_contribuyente, clasificacion,
         actividad_economica, direccion, telefono, correo)
       values ('Comercial Oriente, S.A. de C.V.', 'Comercial Oriente', $1, '123456-7', 'sociedad', 'mediano',
         'Venta al por mayor de artículos de ferretería', 'Av. Roosevelt Sur, San Miguel', '2661-0000',
         'contabilidad@ejemplo.com')
       returning id`,
      [NIT_DEMO],
    );
    const empresaId = empresa.rows[0]!.id;

    const sucursal = async (nombre: string, codigo: string, direccion: string, esMatriz: boolean) =>
      (
        await c.query<{ id: string }>(
          `insert into sucursales (empresa_id, nombre, codigo_establecimiento, direccion, es_matriz)
           values ($1, $2, $3, $4, $5) returning id`,
          [empresaId, nombre, codigo, direccion, esMatriz],
        )
      ).rows[0]!.id;
    const sucursales = {
      matriz: await sucursal("Casa matriz San Miguel", "0001", "Av. Roosevelt Sur, San Miguel", true),
      usulutan: await sucursal("Sucursal Usulután", "0002", "Calle Grimaldi, Usulután", false),
    };

    // Administrador, contador y consulta ven todas las sucursales; el auxiliar solo la matriz.
    for (const u of USUARIOS_DEMO) {
      const m = await c.query<{ id: string }>(
        `insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)
         returning id`,
        [u.id, empresaId, u.rol, u.rol !== AUXILIAR.rol],
      );
      if (u.rol === AUXILIAR.rol) {
        await c.query(`insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)`, [
          m.rows[0]!.id,
          sucursales.matriz,
        ]);
      }
    }

    await c.query(`select interno.copiar_catalogo_base($1::uuid)`, [empresaId]);
    await c.query(
      `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2026, '2026-01-01', '2026-12-31')`,
      [empresaId],
    );

    const cuentas = new Map(
      (
        await c.query<{ codigo: string; id: string }>(
          `select codigo, id from cuentas where empresa_id = $1`,
          [empresaId],
        )
      ).rows.map((r) => [r.codigo, r.id]),
    );
    const cuenta = (codigo: string) => {
      const id = cuentas.get(codigo);
      if (!id) throw new Error(`La semilla usa la cuenta ${codigo}, que no está en el catálogo base`);
      return id;
    };

    const registrar = async (p: PartidaDemo, extra: { revertidaId?: string } = {}) => {
      await comoUsuario(p.estado === "borrador" ? AUXILIAR.id : CONTADOR.id);
      const r = await c.query<{ id: string }>(
        `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, documento_tipo, documento_numero,
           partida_revertida_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [
          empresaId,
          sucursales[p.sucursal ?? "matriz"],
          p.fecha,
          p.tipo ?? "operacion",
          p.concepto,
          p.documento?.[0] ?? null,
          p.documento?.[1] ?? null,
          extra.revertidaId ?? null,
        ],
      );
      const id = r.rows[0]!.id;
      for (const [orden, [codigo, debe, haber]] of p.lineas.entries()) {
        await c.query(
          `insert into partida_detalles (partida_id, empresa_id, cuenta_id, debe, haber, orden)
           values ($1, $2, $3, $4, $5, $6)`,
          [id, empresaId, cuenta(codigo), debe, haber, orden],
        );
      }
      if (p.estado === "contabilizada") {
        await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [id]);
      }
      return id;
    };

    // Se registran en orden de fecha para que los correlativos sigan la cronología.
    const todas = [...PARTIDAS, PARTIDA_ANULADA].sort((a, b) => a.fecha.localeCompare(b.fecha));
    let anuladaId = "";
    for (const p of todas) {
      const id = await registrar(p);
      if (p === PARTIDA_ANULADA) anuladaId = id;
    }

    // Reversión: mismas cuentas con debe y haber invertidos, y la original queda anulada con su motivo.
    await registrar(
      {
        fecha: "2026-02-21",
        tipo: "reversion",
        concepto: "Reversión de la venta registrada dos veces",
        estado: "contabilizada",
        lineas: PARTIDA_ANULADA.lineas.map(([codigo, debe, haber]) => [codigo, haber, debe]),
      },
      { revertidaId: anuladaId },
    );
    await comoUsuario(CONTADOR.id);
    await c.query(
      `update partidas set estado = 'anulada', motivo_anulacion = 'La factura 0001-00000001 ya estaba registrada'
       where id = $1`,
      [anuladaId],
    );

    await c.query("commit");
    return { creada: true, empresaId };
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

/** Conexión de la semilla: nunca DATABASE_URL y nunca una base remota sin permiso explícito. */
export function urlSemilla(env: NodeJS.ProcessEnv = process.env): string {
  const url = env["SEED_DATABASE_URL"] ?? env["TEST_DATABASE_URL"] ?? URL_LOCAL;
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (!local && env["SEED_PERMITIR_REMOTO"] !== "1") {
    throw new Error(
      `La semilla solo corre contra una base local (se recibió ${host}). ` +
        "Para una base remota de pruebas defina SEED_PERMITIR_REMOTO=1.",
    );
  }
  return url;
}

if (import.meta.main) {
  const c = new pg.Client({ connectionString: urlSemilla() });
  await c.connect();
  try {
    const r = await sembrar(c);
    console.log(
      r.creada
        ? `Semilla cargada: Comercial Oriente, S.A. de C.V. (${r.empresaId}).`
        : "La empresa de demostración ya existe; no se cargó nada.",
    );
    for (const u of USUARIOS_DEMO) console.log(`  ${u.correo}  ${u.id}`);
  } finally {
    await c.end();
  }
}
