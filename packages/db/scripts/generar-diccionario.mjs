// Genera el diccionario de datos (JSON y Markdown) leyendo el catálogo de PostgreSQL.
// Uso: node scripts/generar-diccionario.mjs <directorio_salida>
import { writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/contable";
const DEST = process.argv[2] ?? ".";

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
           c.column_default as defecto,
           col_description(a.attrelid, a.attnum) as descripcion
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    join pg_attribute a on a.attrelid = format('public.%I', c.table_name)::regclass and a.attname = c.column_name
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
const descTablas = Object.fromEntries(
  (
    await c.query(`
    select c.relname as tabla, obj_description(c.oid, 'pg_class') as descripcion
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'`)
  ).rows.map((r) => [r.tabla, r.descripcion ?? ""]),
);
await c.end();

const tablas = [...new Set(cols.map((x) => x.tabla))].map((t) => ({
  tabla: t,
  descripcion: descTablas[t] ?? "",
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
      return {
        columna: x.columna,
        tipo: x.tipo,
        nula: x.nula,
        claves: claves.join(", "),
        defecto,
        descripcion: x.descripcion ?? "",
      };
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
  md += `## ${t.tabla}\n\n${t.descripcion}\n\n| Columna | Tipo | Nulo | Claves | Por defecto | Descripción |\n|---|---|---|---|---|---|\n`;
  md +=
    t.columnas
      .map(
        (x) =>
          `| \`${x.columna}\` | ${x.tipo} | ${x.nula ? "sí" : "no"} | ${x.claves} | ${x.defecto ? `\`${x.defecto}\`` : ""} | ${x.descripcion} |`,
      )
      .join("\n") + "\n\n";
}
writeFileSync(path.join(DEST, "diccionario-de-datos.md"), md);
console.log(`OK → ${tablas.length} tablas, ${cols.length} columnas, ${enums.length} enumerados`);
