// Alertas de reabastecimiento (HU-67, S3-T85 a S3-T87): existencia actual contra el punto de reorden.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ProductoReabastecimientoVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR_LIMITADO = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const SIN_MEMBRESIA = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let sucursalSecundaria: string;
let n = 0;

async function pedir(
  metodo: string,
  ruta: string,
  usuario: string | null,
  cuerpo?: unknown,
  empresa = esc.empresaId,
) {
  const r = await fetch(`${url}/empresas/${empresa}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

async function crearUsuario(id: string, rol: number, sucursal: string | null) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${id.slice(0, 4)}`,
    `u${id.slice(0, 4)}@reabastecimiento.test`,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
    [id, esc.empresaId, rol, sucursal === null],
  );
  if (sucursal) {
    await c.query(
      "insert into membresia_sucursales (membresia_id, sucursal_id) select id, $2 from membresias where usuario_id = $1 and empresa_id = $3",
      [id, sucursal, esc.empresaId],
    );
  }
}

async function nuevoProducto(existenciaMinima: string) {
  const r = await pedir("POST", "/productos", CONTADOR, {
    codigo: `REA-${++n}`,
    nombre: `Producto ${n}`,
    existenciaMinima,
  });
  expect(r.status).toBe(201);
  return r.cuerpo["id"] as string;
}

async function mover(productoId: string, tipo: "entrada" | "salida", cantidad: string, fecha: string) {
  return pedir("POST", "/movimientos-inventario", CONTADOR, {
    productoId,
    sucursalId: esc.sucursalId,
    tipo,
    cantidad,
    fecha,
    ...(tipo === "entrada" ? { costoUnitario: "10.00" } : {}),
  });
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_reabastecimiento");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-670101-101-1");
  sucursalSecundaria = (
    await c.query(
      "insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Usulután', 'S002') returning id",
      [esc.empresaId],
    )
  ).rows[0].id as string;
  await crearUsuario(CONTADOR, 2, null);
  await crearUsuario(AUXILIAR_LIMITADO, 3, esc.sucursalId);
  await crearUsuario(CONSULTA, 4, esc.sucursalId);
  await c.query(
    "delete from rol_permisos rp using permisos p where rp.permiso_id = p.id and rp.rol_id = 4 and p.modulo = 'inventario' and p.accion = 'ver'",
  );

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("alertas de reabastecimiento", () => {
  it("incluye existencias bajo el mínimo y en el umbral, y excluye las superiores o sin punto de reorden", async () => {
    const agotado = await nuevoProducto("5");
    const debajo = await nuevoProducto("5");
    const enUmbral = await nuevoProducto("5");
    const sobreUmbral = await nuevoProducto("5");
    const sinPuntoReorden = await nuevoProducto("0");
    expect((await mover(debajo, "entrada", "6", "2026-10-01")).status).toBe(201);
    expect((await mover(debajo, "salida", "2", "2026-10-02")).status).toBe(201);
    expect((await mover(enUmbral, "entrada", "5", "2026-10-01")).status).toBe(201);
    expect((await mover(sobreUmbral, "entrada", "6", "2026-10-01")).status).toBe(201);
    expect((await mover(sinPuntoReorden, "entrada", "1", "2026-10-01")).status).toBe(201);

    const r = await pedir("GET", `/productos/reabastecimiento?sucursalId=${esc.sucursalId}`, CONTADOR);
    expect(r.status).toBe(200);
    const filas = r.cuerpo as unknown as ProductoReabastecimientoVista[];
    expect(filas).toEqual([
      expect.objectContaining({
        productoId: agotado,
        existenciaActual: "0.0000",
        existenciaMinima: "5.0000",
        cantidadFaltante: "5.0000",
      }),
      expect.objectContaining({
        productoId: debajo,
        existenciaActual: "4.0000",
        existenciaMinima: "5.0000",
        cantidadFaltante: "1.0000",
      }),
      expect.objectContaining({
        productoId: enUmbral,
        existenciaActual: "5.0000",
        existenciaMinima: "5.0000",
        cantidadFaltante: "0.0000",
      }),
    ]);
  });

  it("aplica los permisos y el alcance por sucursal", async () => {
    const producto = await nuevoProducto("3");
    const ruta = `/productos/reabastecimiento?sucursalId=${esc.sucursalId}`;
    expect((await pedir("GET", ruta, CONSULTA)).status).toBe(403);
    expect((await pedir("GET", ruta, SIN_MEMBRESIA)).status).toBe(404);
    const permitida = await pedir("GET", ruta, AUXILIAR_LIMITADO);
    expect(permitida.status).toBe(200);
    expect(permitida.cuerpo).toEqual(
      expect.arrayContaining([expect.objectContaining({ productoId: producto })]),
    );
    expect(
      (await pedir("GET", `/productos/reabastecimiento?sucursalId=${sucursalSecundaria}`, AUXILIAR_LIMITADO))
        .status,
    ).toBe(403);
  });

  it("rechaza la consulta si no trae una sucursal UUID", async () => {
    expect((await pedir("GET", "/productos/reabastecimiento?sucursalId=invalid", CONTADOR)).status).toBe(400);
  });
});
