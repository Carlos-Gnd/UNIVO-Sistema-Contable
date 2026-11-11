// Genera el diagrama entidad-relación físico (PlantUML) leyendo el catálogo de PostgreSQL.
// Uso: node scripts/generar-diagrama-er.mjs [salida.puml]
// Conecta a TEST_DATABASE_URL (por defecto el contenedor local con las migraciones aplicadas).
import { writeFileSync } from "node:fs";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/contable";
const SALIDA = process.argv[2] ?? "er-02-fisico.puml";
const OMITIR = new Set(["_prisma_migrations"]);

const c = new pg.Client({ connectionString: URL });
await c.connect();

const columnas = (
  await c.query(`
    select c.table_name as tabla, c.column_name as columna, c.is_nullable = 'YES' as nula,
           case when c.data_type = 'USER-DEFINED' then c.udt_name
                when c.data_type = 'character varying' then 'varchar(' || c.character_maximum_length || ')'
                when c.data_type = 'numeric' then 'numeric(' || c.numeric_precision || ',' || c.numeric_scale || ')'
                when c.data_type like 'timestamp%' then 'timestamptz'
                else c.data_type end as tipo
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position`)
).rows;

const llaves = (
  await c.query(`
    select tc.table_name as tabla, kcu.column_name as columna, tc.constraint_type as tipo,
           ccu.table_name as ref_tabla
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    left join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema and tc.constraint_type = 'FOREIGN KEY'
    where tc.table_schema = 'public' and tc.constraint_type in ('PRIMARY KEY', 'FOREIGN KEY')`)
).rows;
await c.end();

const esPk = new Set(llaves.filter((k) => k.tipo === "PRIMARY KEY").map((k) => `${k.tabla}.${k.columna}`));
const fks = llaves.filter((k) => k.tipo === "FOREIGN KEY");
const esFk = new Set(fks.map((k) => `${k.tabla}.${k.columna}`));

const tablas = [...new Set(columnas.map((x) => x.tabla))].filter((t) => !OMITIR.has(t));
let out = `@startuml er-02-fisico
!include ../../estilo.iuml
title Modelo físico de datos (generado desde PostgreSQL)
hide circle
hide empty members
skinparam linetype ortho
' Generado por packages/db/scripts/generar-diagrama-er.mjs — no editar a mano

`;
for (const t of tablas) {
  const cols = columnas.filter((x) => x.tabla === t);
  out += `entity ${t} {\n`;
  for (const col of cols.filter((x) => esPk.has(`${t}.${x.columna}`)))
    out += `  * ${col.columna} : ${col.tipo} <<PK${esFk.has(`${t}.${col.columna}`) ? ", FK" : ""}>>\n`;
  out += "  --\n";
  for (const col of cols.filter((x) => !esPk.has(`${t}.${x.columna}`))) {
    const fk = esFk.has(`${t}.${col.columna}`) ? " <<FK>>" : "";
    out += `  ${col.nula ? "" : "* "}${col.columna} : ${col.tipo}${fk}\n`;
  }
  out += "}\n\n";
}
const vistas = new Set();
for (const k of fks) {
  if (OMITIR.has(k.tabla)) continue;
  const clave = `${k.tabla}.${k.columna}`;
  if (vistas.has(clave)) continue;
  vistas.add(clave);
  const nula = columnas.find((x) => x.tabla === k.tabla && x.columna === k.columna)?.nula;
  const etiqueta = k.ref_tabla === k.tabla ? ` : ${k.columna}` : "";
  out += `${k.ref_tabla} ${nula ? "|o" : "||"}--o{ ${k.tabla}${etiqueta}\n`;
}
out += "@enduml\n";
writeFileSync(SALIDA, out);
console.log(`OK → ${SALIDA} (${tablas.length} tablas, ${vistas.size} relaciones)`);
