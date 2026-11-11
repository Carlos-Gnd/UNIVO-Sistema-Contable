// Genera el diccionario de datos (JSON y Markdown) leyendo el catálogo de PostgreSQL.
// Uso: node scripts/generar-diccionario.mjs <directorio_salida>
import { writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/contable";
const DEST = process.argv[2] ?? ".";

const DESCRIPCIONES = {
  empresas: "Contribuyentes que llevan su contabilidad en el sistema (persona natural o sociedad).",
  sucursales: "Establecimientos de la empresa; cada registro contable indica su sucursal.",
  usuarios: "Perfil de las personas usuarias; el id coincide con el de Supabase Auth.",
  roles: "Roles del sistema: administrador, contador, auxiliar contable y solo consulta.",
  permisos: "Acciones autorizables, expresadas como módulo y acción.",
  rol_permisos: "Matriz de permisos: qué acciones tiene cada rol.",
  membresias: "Acceso de un usuario a una empresa con un rol.",
  membresia_sucursales: "Sucursales a las que está limitado un usuario dentro de una empresa.",
  cuentas: "Catálogo de cuentas por empresa, con nivel y cuenta padre calculados del código.",
  ejercicios: "Años contables de cada empresa.",
  periodos: "Meses de cada ejercicio; un período cerrado bloquea sus partidas.",
  partidas: "Encabezado de las partidas del libro diario.",
  partida_detalles: "Líneas de cada partida: cuenta y monto en el debe o en el haber.",
  correlativos: "Último número de partida usado por ámbito de numeración.",
  bitacora: "Registro inmutable de todos los cambios, con valores anteriores y nuevos.",
};

const c = new pg.Client({ connectionString: URL });
await c.connect();
const cols = (
  await c.query(`
    select c.table_name as tabla, c.column_name as columna, c.ordinal_position as orden, c.is_nullable = 'YES' as nula,
           case when c.data_type = 'USER-DEFINED' then c.udt_name
                when c.data_type = 'character varying' then 'varchar(' || c.character_maximum_length || ')'
                when c.data_type = 'numeric' then 'numeric(' || c.numeric_precision || ',' || c.numeric_scale || ')'
                when c.data_type like 'timestamp%' then 'timestamptz'
                else c.data_type end as tipo,
           c.column_default as defecto
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.table_name <> '_prisma_migrations'
    order by c.table_name, c.ordinal_position`)
).rows;
const llaves = (
  await c.query(`
    select tc.table_name as tabla, kcu.column_name as columna, tc.constraint_type as tipo, ccu.table_name as ref
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    left join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema and tc.constraint_type = 'FOREIGN KEY'
    where tc.table_schema = 'public' and tc.constraint_type in ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')`)
).rows;
const enums = (
  await c.query(`
    select t.typname as nombre, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as valores
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' group by t.typname order by t.typname`)
).rows;
await c.end();

const tablas = [...new Set(cols.map((x) => x.tabla))].map((t) => ({
  tabla: t,
  descripcion: DESCRIPCIONES[t] ?? "",
  columnas: cols
    .filter((x) => x.tabla === t)
    .map((x) => {
      const k = llaves.filter((y) => y.tabla === t && y.columna === x.columna);
      const claves = [
        ...(k.some((y) => y.tipo === "PRIMARY KEY") ? ["PK"] : []),
        ...k.filter((y) => y.tipo === "FOREIGN KEY").map((y) => `FK → ${y.ref}`),
        ...(k.some((y) => y.tipo === "UNIQUE") ? ["UQ"] : []),
      ];
      const defecto = (x.defecto ?? "").replace(/::[a-z_ ]+/g, "").replace(/^'(.*)'$/, "$1");
      return { columna: x.columna, tipo: x.tipo, nula: x.nula, claves: claves.join(", "), defecto };
    }),
}));

writeFileSync(path.join(DEST, "diccionario.json"), JSON.stringify({ tablas, enums }, null, 2));
let md =
  "# Diccionario de datos\n\nGenerado desde PostgreSQL con `packages/db/scripts/generar-diccionario.mjs`.\n\n";
md +=
  "## Tipos enumerados\n\n| Tipo | Valores |\n|---|---|\n" +
  enums.map((e) => `| \`${e.nombre}\` | ${e.valores} |`).join("\n") +
  "\n\n";
for (const t of tablas) {
  md += `## ${t.tabla}\n\n${t.descripcion}\n\n| Columna | Tipo | Nulo | Claves | Por defecto |\n|---|---|---|---|---|\n`;
  md +=
    t.columnas
      .map(
        (x) =>
          `| \`${x.columna}\` | ${x.tipo} | ${x.nula ? "sí" : "no"} | ${x.claves} | ${x.defecto ? `\`${x.defecto}\`` : ""} |`,
      )
      .join("\n") + "\n\n";
}
writeFileSync(path.join(DEST, "diccionario-de-datos.md"), md);
console.log(`OK → ${tablas.length} tablas, ${cols.length} columnas, ${enums.length} enumerados`);
