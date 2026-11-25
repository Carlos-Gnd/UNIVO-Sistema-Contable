// Productos y categorías del inventario (HU-64, S3-T76 y S3-T78): código único por empresa, permisos y bitácora.
// Usa una base propia (contable_api_productos) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CategoriaProducto, ProductoVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;

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

const producto = (cuerpo: Record<string, unknown>) => ({
  codigo: "CEL-001",
  nombre: "Celular básico",
  ...cuerpo,
});

async function usuario(id: string, rol: number, empresaId: string) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3) on conflict do nothing", [
    id,
    `Usuario ${rol}`,
    `u${id.slice(0, 4)}@productos.test`,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
    [id, empresaId, rol, rol <= 2],
  );
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_productos");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");
  ajena = await crearEscenario(c, "0614-010190-102-0");
  await usuario(CONTADOR, 2, esc.empresaId);
  await usuario(AUXILIAR, 3, esc.empresaId);
  await c.query(
    "insert into membresia_sucursales (membresia_id, sucursal_id) select id, $2 from membresias where usuario_id = $1 and empresa_id = $3",
    [AUXILIAR, esc.sucursalId, esc.empresaId],
  );
  await usuario(CONSULTA, 4, esc.empresaId);
  await c.query(
    "insert into membresia_sucursales (membresia_id, sucursal_id) select id, $2 from membresias where usuario_id = $1 and empresa_id = $3",
    [CONSULTA, esc.sucursalId, esc.empresaId],
  );
  await usuario(FORASTERO, 2, ajena.empresaId);

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

describe("categorías de producto", () => {
  it("se crean, se listan con su número de productos y no se repiten por empresa", async () => {
    const creada = await pedir("POST", "/categorias-producto", CONTADOR, { nombre: "Teléfonos" });
    expect(creada.status).toBe(201);
    expect(creada.cuerpo).toMatchObject({ nombre: "Teléfonos", activa: true, productos: 0 });

    expect((await pedir("POST", "/categorias-producto", CONTADOR, { nombre: "Teléfonos" })).status).toBe(409);
    // otra empresa sí puede usar el mismo nombre
    expect(
      (await pedir("POST", "/categorias-producto", FORASTERO, { nombre: "Teléfonos" }, ajena.empresaId))
        .status,
    ).toBe(201);

    const lista = (await pedir("GET", "/categorias-producto", CONSULTA))
      .cuerpo as unknown as CategoriaProducto[];
    expect(lista.map((x) => x.nombre)).toEqual(["Teléfonos"]);
  });

  it("se inactivan con PATCH y rechazan un cuerpo sin cambios", async () => {
    const { cuerpo } = await pedir("POST", "/categorias-producto", CONTADOR, { nombre: "Descontinuados" });
    const id = cuerpo["id"] as string;
    expect((await pedir("PATCH", `/categorias-producto/${id}`, CONTADOR, {})).status).toBe(400);
    const r = await pedir("PATCH", `/categorias-producto/${id}`, CONTADOR, { activa: false });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ activa: false });
  });
});

describe("productos", () => {
  it("se crean con el precio normalizado y se consultan con su categoría", async () => {
    const categorias = (await pedir("GET", "/categorias-producto", CONTADOR))
      .cuerpo as unknown as CategoriaProducto[];
    const telefonos = categorias.find((x) => x.nombre === "Teléfonos")!;
    const r = await pedir(
      "POST",
      "/productos",
      AUXILIAR,
      producto({ categoriaId: telefonos.id, precioVenta: 135.5, unidadMedida: "unidad" }),
    );
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      codigo: "CEL-001",
      categoria: "Teléfonos",
      precioVenta: "135.50",
      activo: true,
    });
    const id = r.cuerpo["id"] as string;
    expect((await pedir("GET", `/productos/${id}`, CONSULTA)).cuerpo).toMatchObject({
      nombre: "Celular básico",
    });
    const conteo = (await pedir("GET", "/categorias-producto", CONSULTA))
      .cuerpo as unknown as CategoriaProducto[];
    expect(conteo.find((x) => x.nombre === "Teléfonos")?.productos).toBe(1);
  });

  it("el código es único por empresa: se rechaza el repetido y otra empresa puede usarlo", async () => {
    expect((await pedir("POST", "/productos", CONTADOR, producto({ nombre: "Otro" }))).status).toBe(409);
    const ajeno = await pedir("POST", "/productos", FORASTERO, producto({}), ajena.empresaId);
    expect(ajeno.status).toBe(201);
  });

  it("valida el código, el precio y la categoría", async () => {
    expect((await pedir("POST", "/productos", CONTADOR, producto({ codigo: "con espacio" }))).status).toBe(
      400,
    );
    expect(
      (await pedir("POST", "/productos", CONTADOR, producto({ codigo: "A-1", precioVenta: "-5" }))).status,
    ).toBe(400);
    const inexistente = "99999999-9999-4999-8999-999999999999";
    expect(
      (await pedir("POST", "/productos", CONTADOR, producto({ codigo: "A-2", categoriaId: inexistente })))
        .status,
    ).toBe(404);
    // una categoría de otra empresa no existe para esta
    const deOtra = (await pedir("GET", "/categorias-producto", FORASTERO, undefined, ajena.empresaId))
      .cuerpo as unknown as CategoriaProducto[];
    expect(
      (await pedir("POST", "/productos", CONTADOR, producto({ codigo: "A-3", categoriaId: deOtra[0]!.id })))
        .status,
    ).toBe(404);
    // una categoría inactiva no se puede asignar
    const todas = (await pedir("GET", "/categorias-producto", CONTADOR))
      .cuerpo as unknown as CategoriaProducto[];
    const inactiva = todas.find((x) => !x.activa)!;
    expect(
      (await pedir("POST", "/productos", CONTADOR, producto({ codigo: "A-4", categoriaId: inactiva.id })))
        .status,
    ).toBe(422);
  });

  it("se editan, se inactivan y se filtran por texto, categoría y estado", async () => {
    const creado = await pedir(
      "POST",
      "/productos",
      CONTADOR,
      producto({ codigo: "CAR-010", nombre: "Cargador USB-C" }),
    );
    const id = creado.cuerpo["id"] as string;
    const editado = await pedir("PATCH", `/productos/${id}`, CONTADOR, {
      precioVenta: "12",
      categoriaId: null,
    });
    expect(editado.status).toBe(200);
    expect(editado.cuerpo).toMatchObject({ precioVenta: "12.00", categoria: null });
    // no se puede repetir el código de otro producto
    expect((await pedir("PATCH", `/productos/${id}`, CONTADOR, { codigo: "CEL-001" })).status).toBe(409);

    expect((await pedir("PATCH", `/productos/${id}`, CONTADOR, { activo: false })).cuerpo).toMatchObject({
      activo: false,
    });
    const activos = (await pedir("GET", "/productos?activo=true", CONSULTA))
      .cuerpo as unknown as ProductoVista[];
    expect(activos.map((p) => p.codigo)).toEqual(["CEL-001"]);
    const inactivos = (await pedir("GET", "/productos?activo=false", CONSULTA))
      .cuerpo as unknown as ProductoVista[];
    expect(inactivos.map((p) => p.codigo)).toEqual(["CAR-010"]);
    const busqueda = (await pedir("GET", "/productos?busqueda=usb", CONSULTA))
      .cuerpo as unknown as ProductoVista[];
    expect(busqueda.map((p) => p.codigo)).toEqual(["CAR-010"]);
  });

  it("un producto de otra empresa no se ve ni se edita", async () => {
    const ajeno = (await pedir("GET", "/productos", FORASTERO, undefined, ajena.empresaId))
      .cuerpo as unknown as ProductoVista[];
    const idAjeno = ajeno[0]!.id;
    expect((await pedir("GET", `/productos/${idAjeno}`, CONTADOR)).status).toBe(404);
    expect((await pedir("PATCH", `/productos/${idAjeno}`, CONTADOR, { nombre: "X" })).status).toBe(404);
  });
});

describe("permisos y bitácora", () => {
  it("consulta solo puede ver; auxiliar y contador registran; sin sesión no entra y quien no es miembro no ve la empresa", async () => {
    expect((await pedir("GET", "/productos", CONSULTA)).status).toBe(200);
    expect((await pedir("POST", "/productos", CONSULTA, producto({ codigo: "X-1" }))).status).toBe(403);
    expect((await pedir("POST", "/categorias-producto", CONSULTA, { nombre: "No" })).status).toBe(403);
    expect((await pedir("GET", "/productos", null)).status).toBe(401);
    // quien no es miembro de la empresa ni siquiera la ve
    expect((await pedir("GET", "/productos", FORASTERO)).status).toBe(404);
  });

  it("cada alta y cambio queda en la bitácora a nombre de quien lo hizo", async () => {
    const filas = await c.query(
      `select accion, usuario_id from bitacora where empresa_id = $1 and tabla = 'productos' order by creado_en`,
      [esc.empresaId],
    );
    expect(filas.rows.length).toBeGreaterThanOrEqual(3);
    expect(filas.rows[0]).toMatchObject({ accion: "INSERT", usuario_id: AUXILIAR });
    expect(filas.rows.some((f) => f.accion === "UPDATE" && f.usuario_id === CONTADOR)).toBe(true);
    const cat = await c.query(
      `select 1 from bitacora where empresa_id = $1 and tabla = 'categorias_producto'`,
      [esc.empresaId],
    );
    expect(cat.rows.length).toBeGreaterThan(0);
  });
});
