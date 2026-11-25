import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, crearPartida, errorDe, reiniciarBase, type Escenario } from "./helpers";

const USUARIO = "11111111-1111-4111-8111-111111111111";
const PERIODO = "2026-11-01";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let esc: Escenario;
let empleadoId: string;
let partidaId: string;
let partidaDiciembreId: string;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-700075-101-5");
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@planillas.test')",
    [USUARIO],
  );
  const empleado = await c.query(
    "insert into empleados (empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, salario, fecha_ingreso) " +
      "values ($1, $2, 'Ana', 'Pérez', 'DUI-01', 'NIT-01', 'ISSS-01', 'NUP-01', 'Auxiliar', 450, '2026-01-01') returning id",
    [esc.empresaId, esc.sucursalId],
  );
  empleadoId = empleado.rows[0]!.id as string;
  await c.query("begin");
  await c.query("select set_config('app.usuario_id', $1, true)", [USUARIO]);
  partidaId = await crearPartida(c, esc, "2026-11-30", [
    [esc.cuentas["110101"]!, "1.00", "0.00"],
    [esc.cuentas["110101"]!, "0.00", "1.00"],
  ]);
  await c.query("update partidas set origen = 'planilla' where id = $1", [partidaId]);
  await c.query(
    "insert into planillas_calculadas (empresa_id, sucursal_id, periodo, partida_id, empleado_id, nombres, apellidos, dui, numero_isss, nup, salario_cotizable, isss_laboral, isss_patronal, afp_laboral, afp_patronal) " +
      "values ($1, $2, $3, $4, $5, 'Ana', 'Pérez', 'DUI-01', 'ISSS-01', 'NUP-01', 450, 13.50, 33.75, 32.63, 39.38)",
    [esc.empresaId, esc.sucursalId, PERIODO, partidaId, empleadoId],
  );
  partidaDiciembreId = await crearPartida(c, esc, "2026-12-31", [
    [esc.cuentas["110101"]!, "1.00", "0.00"],
    [esc.cuentas["110101"]!, "0.00", "1.00"],
  ]);
  await c.query("update partidas set origen = 'planilla' where id = $1", [partidaDiciembreId]);
  await c.query("commit");
});

afterAll(async () => {
  await c?.end();
});

describe("planillas oficiales", () => {
  it("mantiene unicidad por empresa, período y persona y protege la tabla con RLS", async () => {
    expect(
      await errorDe(
        c,
        "insert into planillas_calculadas (empresa_id, sucursal_id, periodo, partida_id, empleado_id, nombres, apellidos, dui, numero_isss, nup, salario_cotizable, isss_laboral, isss_patronal, afp_laboral, afp_patronal) " +
          "values ($1, $2, $3, $4, $5, 'Ana', 'Pérez', 'DUI-01', 'ISSS-01', 'NUP-01', 450, 13.50, 33.75, 32.63, 39.38)",
        [esc.empresaId, esc.sucursalId, PERIODO, partidaId, empleadoId],
      ),
    ).toMatch(/planillas_calculadas_empresa_periodo_empleado_unq/i);

    await c.query(
      "insert into planillas_presentaciones (empresa_id, periodo, tipo, presentada_por) values ($1, $2, 'isss', $3)",
      [esc.empresaId, PERIODO, USUARIO],
    );

    const rls = await c.query(
      "select relrowsecurity from pg_class where oid = 'public.planillas_calculadas'::regclass",
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    for (const { rolname } of (
      await c.query("select rolname from pg_roles where rolname in ('anon', 'authenticated')")
    ).rows as { rolname: string }[]) {
      const acceso = await c.query(
        "select has_table_privilege($1, 'public.planillas_calculadas', 'select') as puede_leer",
        [rolname],
      );
      expect(acceso.rows[0]?.puede_leer).toBe(false);
    }
  });

  it("registra quién presentó y bloquea modificaciones posteriores", async () => {
    const estado = await c.query(
      "select p.tipo::text, u.nombre as presentada_por, p.presentada_en is not null as presentada " +
        "from planillas_presentaciones p join usuarios u on u.id = p.presentada_por where p.empresa_id = $1 and p.periodo = $2",
      [esc.empresaId, PERIODO],
    );
    expect(estado.rows).toEqual([{ tipo: "isss", presentada_por: "Contador", presentada: true }]);

    expect(
      await errorDe(
        c,
        "update planillas_calculadas set salario_cotizable = 999 where empresa_id = $1 and periodo = $2 and empleado_id = $3",
        [esc.empresaId, PERIODO, empleadoId],
      ),
    ).toMatch(/no se puede modificar el cálculo.*ya presentada/i);
    expect(
      await errorDe(
        c,
        "delete from planillas_calculadas where empresa_id = $1 and periodo = $2 and empleado_id = $3",
        [esc.empresaId, PERIODO, empleadoId],
      ),
    ).toMatch(/no se puede modificar el cálculo.*ya presentada/i);
    expect(
      await errorDe(
        c,
        "update planillas_presentaciones set presentada_en = now() where empresa_id = $1 and periodo = $2 and tipo = 'isss'",
        [esc.empresaId, PERIODO],
      ),
    ).toMatch(/no se puede modificar ni eliminar/i);
    expect(
      await errorDe(
        c,
        "delete from planillas_presentaciones where empresa_id = $1 and periodo = $2 and tipo = 'isss'",
        [esc.empresaId, PERIODO],
      ),
    ).toMatch(/no se puede modificar ni eliminar/i);
  });

  it("rechaza importes negativos y fechas que no inician el mes", async () => {
    expect(
      await errorDe(
        c,
        "insert into planillas_calculadas (empresa_id, sucursal_id, periodo, partida_id, empleado_id, nombres, apellidos, dui, numero_isss, nup, salario_cotizable, isss_laboral, isss_patronal, afp_laboral, afp_patronal) " +
          "values ($1, $2, '2026-12-02', $3, $4, 'Ana', 'Pérez', 'DUI-01', 'ISSS-01', 'NUP-01', 450, 13.50, 33.75, 32.63, 39.38)",
        [esc.empresaId, esc.sucursalId, partidaDiciembreId, empleadoId],
      ),
    ).toMatch(/planillas_calculadas_periodo_inicio_mes/i);
    expect(
      await errorDe(
        c,
        "insert into planillas_calculadas (empresa_id, sucursal_id, periodo, partida_id, empleado_id, nombres, apellidos, dui, numero_isss, nup, salario_cotizable, isss_laboral, isss_patronal, afp_laboral, afp_patronal) " +
          "values ($1, $2, '2026-12-01', $3, $4, 'Ana', 'Pérez', 'DUI-01', 'ISSS-01', 'NUP-01', -1, 13.50, 33.75, 32.63, 39.38)",
        [esc.empresaId, esc.sucursalId, partidaDiciembreId, empleadoId],
      ),
    ).toMatch(/planillas_calculadas_importes_no_negativos/i);
  });
});
