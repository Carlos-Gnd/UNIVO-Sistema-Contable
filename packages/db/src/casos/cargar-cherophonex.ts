// Carga el caso CheroPhonex en una base de desarrollo (HU-90, S2-T49).
//
//   pnpm --filter @contable/db caso:cherophonex
//
// Usa CASO_DATABASE_URL, o TEST_DATABASE_URL, o el contenedor local del puerto 54329. Nunca DATABASE_URL:
// así no se carga el caso por accidente en el proyecto de Supabase del equipo. Para una base remota hay que
// pasar CASO_DATABASE_URL y además CASO_PERMITIR_REMOTO=1.
//
// Crea una empresa nueva; si CheroPhonex ya existe (mismo NIT), no hace nada.
import pg from "pg";
import { cargarCasoCherophonex, leerCaso } from "./cherophonex.ts";
import { reiniciarBaseDemo, validarReinicioDemo } from "./reiniciar-demo.ts";

const URL_LOCAL = "postgresql://postgres:postgres@localhost:54329/contable";
const url = process.env["CASO_DATABASE_URL"] ?? process.env["TEST_DATABASE_URL"] ?? URL_LOCAL;
const reiniciar = process.argv.includes("--reiniciar");
const esLocal = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(url);
if (reiniciar) {
  try {
    if (!process.env["CASO_DATABASE_URL"]) {
      throw new Error("Defina CASO_DATABASE_URL apuntando a la base local contable_demo.");
    }
    validarReinicioDemo(url, process.env["CASO_CONFIRMAR_REINICIO"]);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
if (!esLocal && process.env["CASO_PERMITIR_REMOTO"] !== "1") {
  console.error(
    "La base no es local. Para cargar el caso en una base remota, defina CASO_PERMITIR_REMOTO=1.",
  );
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  if (reiniciar) {
    await reiniciarBaseDemo(c);
    console.log("Esquema de contable_demo recreado y migraciones aplicadas.");
  }
  const caso = leerCaso();
  const existente = await c.query(`select 1 from empresas where nit = $1`, [caso.empresa.nit]);
  if (existente.rowCount) {
    console.log(`CheroPhonex (${caso.empresa.nit}) ya existe en esta base; no se hizo nada.`);
  } else {
    const r = await cargarCasoCherophonex(c, caso, { activosFijos: true, historialDemo: true });
    console.log(
      `CheroPhonex cargada: empresa ${r.empresaId}, ${r.partidas} partidas académicas y 92 movimientos históricos contabilizados.`,
    );
  }
} finally {
  await c.end();
}
