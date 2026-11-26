// Ayudas para las pruebas de compras y ventas: una empresa con el catálogo de la clase y sus usuarios.
import type { reiniciarBase } from "../../../packages/db/test/helpers";

type Cliente = Awaited<ReturnType<typeof reiniciarBase>>;

export interface EmpresaComercial {
  empresaId: string;
  sucursalId: string;
  /** Segunda sucursal, a la que no tiene acceso el auxiliar */
  otraSucursalId: string;
  /** Id de la cuenta por código del catálogo */
  cuenta: (codigo: string) => Promise<string>;
}

/**
 * Crea una empresa con casa matriz, otra sucursal, el ejercicio 2026 y el catálogo base de la clase
 * (persona natural). La clasificación decide la retención y percepción del 1 % de IVA.
 */
export async function crearEmpresaComercial(
  c: Cliente,
  nit: string,
  clasificacion: "grande" | "mediano" | "otro" = "otro",
): Promise<EmpresaComercial> {
  const e = await c.query(
    `insert into empresas (nombre, nit, tipo_contribuyente, clasificacion)
     values ($1, $2, 'persona_natural', $3) returning id`,
    [`Empresa ${nit}`, nit, clasificacion],
  );
  const empresaId = e.rows[0].id as string;
  const matriz = await c.query(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento, es_matriz)
     values ($1, 'Casa matriz', 'M001', true) returning id`,
    [empresaId],
  );
  const otra = await c.query(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Usulután', 'S002') returning id`,
    [empresaId],
  );
  await c.query(
    `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2026, '2026-01-01', '2026-12-31')`,
    [empresaId],
  );
  await c.query(`select interno.copiar_catalogo_base($1)`, [empresaId]);
  return {
    empresaId,
    sucursalId: matriz.rows[0].id as string,
    otraSucursalId: otra.rows[0].id as string,
    cuenta: async (codigo) =>
      (await c.query(`select id from cuentas where empresa_id = $1 and codigo = $2`, [empresaId, codigo]))
        .rows[0].id as string,
  };
}

/** Registra un usuario con su rol (1 administrador, 2 contador, 3 auxiliar, 4 consulta) en la empresa. */
export async function crearUsuario(
  c: Cliente,
  id: string,
  rol: number,
  empresa: EmpresaComercial,
  sucursales: readonly string[] | "todas" = "todas",
): Promise<void> {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3) on conflict do nothing", [
    id,
    `Usuario ${id.slice(0, 4)}`,
    `u${id.slice(0, 8)}@comercial.test`,
  ]);
  const m = await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
    [id, empresa.empresaId, rol, sucursales === "todas"],
  );
  if (sucursales !== "todas") {
    for (const s of sucursales) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        m.rows[0].id,
        s,
      ]);
    }
  }
}
