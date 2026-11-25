import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

const USUARIO = "11111111-1111-4111-8111-111111111111";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let esc: Escenario;
let otra: Escenario;

async function guardarVersion(
  empresaId: string,
  vigenteDesde: string,
  tramos: { desde: string; hasta: string | null; porcentaje: string; cuota: string }[],
  usuarioId?: string,
) {
  await c.query("begin");
  try {
    if (usuarioId) await c.query("select set_config('app.usuario_id', $1, true)", [usuarioId]);
    const version = await c.query(
      `insert into configuraciones_planilla (empresa_id, vigente_desde, tasa_isss_laboral, tasa_isss_patronal, techo_isss, tasa_afp_laboral, tasa_afp_patronal)
       values ($1, $2, 3, 7.5, 1000, 7.25, 8.75) returning id`,
      [empresaId, vigenteDesde],
    );
    const id = version.rows[0]!.id as string;
    for (const [indice, tramo] of tramos.entries()) {
      await c.query(
        `insert into tramos_retencion_planilla (empresa_id, configuracion_id, orden, desde, hasta, porcentaje, cuota_fija)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [empresaId, id, indice + 1, tramo.desde, tramo.hasta, tramo.porcentaje, tramo.cuota],
      );
    }
    await c.query("commit");
    return null;
  } catch (error) {
    await c.query("rollback").catch(() => undefined);
    return (error as Error).message;
  }
}

const tablaValida = [
  { desde: "0.00", hasta: "550.00", porcentaje: "0.00", cuota: "0.00" },
  { desde: "550.00", hasta: "895.24", porcentaje: "10.00", cuota: "17.67" },
  { desde: "895.24", hasta: "2038.10", porcentaje: "20.00", cuota: "60.00" },
  { desde: "2038.10", hasta: null, porcentaje: "30.00", cuota: "288.57" },
];

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-720001-101-1");
  otra = await crearEscenario(c, "0614-720002-101-2");
});

afterAll(async () => {
  await c?.end();
});

describe("tasas de planilla", () => {
  it("carga tasas iniciales y tramos progresivos por empresa", async () => {
    const r = await c.query(
      `select c.vigente_desde::text, c.tasa_isss_laboral::text, c.tasa_isss_patronal::text,
              c.techo_isss::text, c.tasa_afp_laboral::text, c.tasa_afp_patronal::text,
              t.orden, t.desde::text, t.hasta::text, t.porcentaje::text, t.cuota_fija::text
       from configuraciones_planilla c join tramos_retencion_planilla t on t.configuracion_id = c.id
       where c.empresa_id = $1 order by t.orden`,
      [esc.empresaId],
    );
    expect(r.rows).toEqual([
      {
        vigente_desde: "2026-01-01",
        tasa_isss_laboral: "3.00",
        tasa_isss_patronal: "7.50",
        techo_isss: "1000.00",
        tasa_afp_laboral: "7.25",
        tasa_afp_patronal: "8.75",
        orden: 1,
        desde: "0.00",
        hasta: "550.00",
        porcentaje: "0.00",
        cuota_fija: "0.00",
      },
      {
        vigente_desde: "2026-01-01",
        tasa_isss_laboral: "3.00",
        tasa_isss_patronal: "7.50",
        techo_isss: "1000.00",
        tasa_afp_laboral: "7.25",
        tasa_afp_patronal: "8.75",
        orden: 2,
        desde: "550.00",
        hasta: "895.24",
        porcentaje: "10.00",
        cuota_fija: "17.67",
      },
      {
        vigente_desde: "2026-01-01",
        tasa_isss_laboral: "3.00",
        tasa_isss_patronal: "7.50",
        techo_isss: "1000.00",
        tasa_afp_laboral: "7.25",
        tasa_afp_patronal: "8.75",
        orden: 3,
        desde: "895.24",
        hasta: "2038.10",
        porcentaje: "20.00",
        cuota_fija: "60.00",
      },
      {
        vigente_desde: "2026-01-01",
        tasa_isss_laboral: "3.00",
        tasa_isss_patronal: "7.50",
        techo_isss: "1000.00",
        tasa_afp_laboral: "7.25",
        tasa_afp_patronal: "8.75",
        orden: 4,
        desde: "2038.10",
        hasta: null,
        porcentaje: "30.00",
        cuota_fija: "288.57",
      },
    ]);
  });

  it("exige una tabla completa, consecutiva, continua y abierta en el último tramo", async () => {
    expect(await guardarVersion(esc.empresaId, "2027-01-01", tablaValida)).toBeNull();
    expect(
      await guardarVersion(esc.empresaId, "2028-01-01", [
        { ...tablaValida[0]!, hasta: "550.00" },
        { ...tablaValida[1]!, desde: "600.00", hasta: null },
      ]),
    ).toMatch(/tramos de retención deben ser continuos/i);
    expect(
      await guardarVersion(esc.empresaId, "2029-01-01", [
        { ...tablaValida[0]! },
        { ...tablaValida[1]!, hasta: "895.24" },
      ]),
    ).toMatch(/último tramo de retención debe quedar abierto/i);
    expect(
      await guardarVersion(esc.empresaId, "2030-01-01", [{ ...tablaValida[0]!, desde: "1.00", hasta: null }]),
    ).toMatch(/primer tramo.*cero/i);
  });

  it("impide duplicar la vigencia, mezclar empresas o alterar el historial", async () => {
    const duplicado = await errorDe(
      c,
      `insert into configuraciones_planilla (empresa_id, vigente_desde, tasa_isss_laboral, tasa_isss_patronal, techo_isss, tasa_afp_laboral, tasa_afp_patronal)
       values ($1, '2026-01-01', 3, 7.5, 1000, 7.25, 8.75)`,
      [esc.empresaId],
    );
    expect(duplicado).toMatch(/configuraciones_planilla_empresa_id_vigente_desde_key/i);

    const version = await c.query("select id from configuraciones_planilla where empresa_id = $1", [
      esc.empresaId,
    ]);
    const mezcla = await errorDe(
      c,
      `insert into tramos_retencion_planilla (empresa_id, configuracion_id, orden, desde, hasta, porcentaje, cuota_fija)
       values ($1, $2, 5, 2038.10, null, 30, 288.57)`,
      [otra.empresaId, version.rows[0]!.id],
    );
    expect(mezcla).toMatch(/foreign key constraint/i);

    const cambio = await errorDe(
      c,
      "update configuraciones_planilla set tasa_isss_laboral = 4 where id = $1",
      [version.rows[0]!.id],
    );
    expect(cambio).toMatch(/configuración de planilla es inmutable/i);
    const borrado = await errorDe(c, "delete from tramos_retencion_planilla where configuracion_id = $1", [
      version.rows[0]!.id,
    ]);
    expect(borrado).toMatch(/configuración de planilla es inmutable/i);
    expect(await errorDe(c, "truncate configuraciones_planilla, tramos_retencion_planilla")).toMatch(
      /no se permite vaciar/i,
    );
  });

  it("audita las versiones, activa RLS y revoca acceso directo a los clientes", async () => {
    await guardarVersion(esc.empresaId, "2040-01-01", tablaValida, USUARIO);
    const auditoria = await c.query(
      "select accion, usuario_id from bitacora where empresa_id = $1 and tabla = 'configuraciones_planilla' and accion = 'INSERT'",
      [esc.empresaId],
    );
    expect(auditoria.rows).toContainEqual({ accion: "INSERT", usuario_id: USUARIO });

    const rls = await c.query(
      `select relname, relrowsecurity from pg_class where oid in ('public.configuraciones_planilla'::regclass, 'public.tramos_retencion_planilla'::regclass)`,
    );
    expect(rls.rows).toHaveLength(2);
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);
    const roles = await c.query("select rolname from pg_roles where rolname in ('anon', 'authenticated')");
    for (const { rolname } of roles.rows as { rolname: string }[]) {
      for (const tabla of ["configuraciones_planilla", "tramos_retencion_planilla"]) {
        const acceso = await c.query("select has_table_privilege($1, $2, 'select') as puede_leer", [
          rolname,
          `public.${tabla}`,
        ]);
        expect(acceso.rows[0]?.puede_leer).toBe(false);
      }
    }
  });
});
