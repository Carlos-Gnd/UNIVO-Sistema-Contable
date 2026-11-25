import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

const USUARIO = "11111111-1111-4111-8111-111111111111";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let esc: Escenario;
let otra: Escenario;

async function insertarEmpleado(empresaId: string, sucursalId: string, sufijo: string) {
  return c.query(
    "insert into empleados (empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, area, salario, fecha_ingreso) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id",
    [
      empresaId,
      sucursalId,
      "Nombre",
      `Empleado ${sufijo}`,
      `DUI-${sufijo}`,
      `NIT-${sufijo}`,
      `ISSS-${sufijo}`,
      `NUP-${sufijo}`,
      "Auxiliar contable",
      "Administración",
      "800.00",
      "2026-01-15",
    ],
  );
}

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-700001-101-1");
  otra = await crearEscenario(c, "0614-700002-101-2");
});

afterAll(async () => {
  await c?.end();
});

describe("empleados", () => {
  it("guarda el salario y asigna el registro a una sucursal de su empresa", async () => {
    await insertarEmpleado(esc.empresaId, esc.sucursalId, "001");
    const r = await c.query(
      "select e.nombres, e.apellidos, e.salario::text, e.activo, s.nombre as sucursal from empleados e join sucursales s on s.id = e.sucursal_id where e.empresa_id = $1",
      [esc.empresaId],
    );
    expect(r.rows).toEqual([
      {
        nombres: "Nombre",
        apellidos: "Empleado 001",
        salario: "800.00",
        activo: true,
        sucursal: "Casa matriz",
      },
    ]);
  });

  it("impide salario negativo e identificadores vacíos", async () => {
    expect(
      await errorDe(
        c,
        "insert into empleados (empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, salario, fecha_ingreso) values ($1, $2, 'Nombre', 'Apellido', 'DUI-NEG', 'NIT-NEG', 'ISSS-NEG', 'NUP-NEG', 'Auxiliar', -1, '2026-01-01')",
        [esc.empresaId, esc.sucursalId],
      ),
    ).toMatch(/empleados_salario_no_negativo/i);
    expect(
      await errorDe(
        c,
        "insert into empleados (empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, salario, fecha_ingreso) values ($1, $2, 'Nombre', 'Apellido', ' ', 'NIT-EMPTY', 'ISSS-EMPTY', 'NUP-EMPTY', 'Auxiliar', 1, '2026-01-01')",
        [esc.empresaId, esc.sucursalId],
      ),
    ).toMatch(/empleados_identificacion_no_vacia/i);
  });

  it("impide asignar una sucursal de otra empresa", async () => {
    expect(
      await errorDe(
        c,
        "insert into empleados (empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, salario, fecha_ingreso) values ($1, $2, 'Nombre', 'Apellido', 'DUI-X', 'NIT-X', 'ISSS-X', 'NUP-X', 'Auxiliar', 1, '2026-01-01')",
        [esc.empresaId, otra.sucursalId],
      ),
    ).toMatch(/la sucursal no pertenece a la empresa/i);
  });

  it("mantiene únicos los identificadores dentro de la empresa, sin bloquear otra empresa", async () => {
    await insertarEmpleado(esc.empresaId, esc.sucursalId, "DUP");
    expect(
      await errorDe(
        c,
        "insert into empleados (empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, salario, fecha_ingreso) values ($1, $2, 'Nombre', 'Apellido', 'DUI-DUP', 'NIT-OTRO', 'ISSS-OTRO', 'NUP-OTRO', 'Auxiliar', 1, '2026-01-01')",
        [esc.empresaId, esc.sucursalId],
      ),
    ).toMatch(/empleados_empresa_id_dui_key/i);
    await insertarEmpleado(otra.empresaId, otra.sucursalId, "DUP");
  });

  it("registra cambios en bitácora y activa RLS sin exponer la tabla", async () => {
    await c.query("begin");
    await c.query("select set_config('app.usuario_id', $1, true)", [USUARIO]);
    await insertarEmpleado(esc.empresaId, esc.sucursalId, "LOG");
    await c.query("commit");

    const bitacora = await c.query(
      "select accion, usuario_id from bitacora where empresa_id = $1 and tabla = 'empleados'",
      [esc.empresaId],
    );
    expect(bitacora.rows).toContainEqual({ accion: "INSERT", usuario_id: USUARIO });

    const rls = await c.query("select relrowsecurity from pg_class where oid = 'public.empleados'::regclass");
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    const roles = await c.query("select rolname from pg_roles where rolname in ('anon', 'authenticated')");
    for (const { rolname } of roles.rows as { rolname: string }[]) {
      const acceso = await c.query(
        "select has_table_privilege($1, 'public.empleados', 'select') as puede_leer",
        [rolname],
      );
      expect(acceso.rows[0]?.puede_leer).toBe(false);
    }
  });
});
