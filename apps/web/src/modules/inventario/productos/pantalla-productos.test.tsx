import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { CategoriaProducto, ProductoVista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaProductos } from "./pantalla-productos";

const E = "e1";
const ADMIN: CodigoPermiso[] = ["inventario.ver", "inventario.registrar"];
const SOLO_VER: CodigoPermiso[] = ["inventario.ver"];
const PRODUCTOS = `GET /empresas/${E}/productos`;
const CATEGORIAS = `GET /empresas/${E}/categorias-producto`;

const categoria = (
  id: string,
  nombre: string,
  extra: Partial<CategoriaProducto> = {},
): CategoriaProducto => ({
  id,
  nombre,
  activa: true,
  productos: 0,
  ...extra,
});
const producto = (
  id: string,
  codigo: string,
  nombre: string,
  extra: Partial<ProductoVista> = {},
): ProductoVista => ({
  id,
  codigo,
  nombre,
  categoriaId: null,
  categoria: null,
  unidadMedida: "unidad",
  precioVenta: "0.00",
  existenciaMinima: "0.0000",
  metodoValuacion: null,
  activo: true,
  ...extra,
});

const TELEFONOS = categoria("c1", "Teléfonos", { productos: 1 });
const VIEJA = categoria("c2", "Descontinuados", { activa: false });
const CELULAR = producto("p1", "CEL-001", "Celular básico", {
  categoriaId: "c1",
  categoria: "Teléfonos",
  precioVenta: "1350.50",
});
const CARGADOR = producto("p2", "CAR-010", "Cargador USB-C", { precioVenta: "12.00", activo: false });

const abrir = (permisos: CodigoPermiso[] = ADMIN) =>
  renderizar(<PantallaProductos parametros={{ empresaId: E }} />, { permisos });

describe("pantalla de productos (HU-64, S3-T77)", () => {
  it("lista los productos con categoría, precio con miles y estado", async () => {
    simularApi({
      [PRODUCTOS]: { cuerpo: [CELULAR, CARGADOR] },
      [CATEGORIAS]: { cuerpo: [TELEFONOS, VIEJA] },
    });
    abrir();

    const fila = (await screen.findByText("CEL-001")).closest("tr")!;
    expect(within(fila).getByText("Teléfonos")).toBeInTheDocument();
    expect(within(fila).getByText("US$ 1,350.50")).toBeInTheDocument();
    expect(within(fila).getByText("Activo")).toBeInTheDocument();
    const inactivo = screen.getByText("CAR-010").closest("tr")!;
    expect(within(inactivo).getByText("Sin categoría")).toBeInTheDocument();
    expect(within(inactivo).getByText("Inactivo")).toBeInTheDocument();
  });

  it("sin permiso de registrar solo se consulta: no hay botones de crear ni de editar", async () => {
    simularApi({ [PRODUCTOS]: { cuerpo: [CELULAR] }, [CATEGORIAS]: { cuerpo: [TELEFONOS] } });
    abrir(SOLO_VER);

    await screen.findByText("CEL-001");
    expect(screen.queryByRole("button", { name: "Nuevo producto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inactivar/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Categorías" })).toBeInTheDocument();
  });

  it("muestra el estado vacío y el de filtros sin resultados", async () => {
    simularApi({ [PRODUCTOS]: { cuerpo: [] }, [CATEGORIAS]: { cuerpo: [] } });
    const { usuario } = abrir();
    expect(await screen.findByText(/Todavía no hay productos/)).toBeInTheDocument();

    await usuario.type(screen.getByRole("searchbox", { name: "Buscar por código o nombre" }), "zzz");
    expect(await screen.findByText("Ningún producto coincide con los filtros.")).toBeInTheDocument();
  });

  it("envía a la API los filtros de búsqueda, categoría y estado", async () => {
    const peticiones = simularApi({
      [PRODUCTOS]: { cuerpo: [CELULAR] },
      [CATEGORIAS]: { cuerpo: [TELEFONOS] },
    });
    const { usuario } = abrir();
    await screen.findByText("CEL-001");

    await usuario.type(screen.getByRole("searchbox", { name: "Buscar por código o nombre" }), "cel");
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Categoría" }), "c1");
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "inactivos");

    await waitFor(() => {
      const ultima = peticiones.filter((p) => p.ruta === `/empresas/${E}/productos`).at(-1)!;
      expect(Object.fromEntries(ultima.consulta)).toEqual({
        busqueda: "cel",
        categoriaId: "c1",
        activo: "false",
      });
    });
  });

  it("crea un producto con el precio normalizado y lo refleja en la lista", async () => {
    let lista = [CELULAR];
    const peticiones = simularApi({
      [PRODUCTOS]: () => ({ cuerpo: lista }),
      [CATEGORIAS]: { cuerpo: [TELEFONOS, VIEJA] },
      [`POST /empresas/${E}/productos`]: ({ cuerpo }) => {
        const datos = cuerpo as { codigo: string; nombre: string };
        const nuevo = producto("p9", datos.codigo, datos.nombre, { precioVenta: "25.00" });
        lista = [...lista, nuevo];
        return { estado: 201, cuerpo: nuevo };
      },
    });
    const { usuario } = abrir();
    await screen.findByText("CEL-001");

    await usuario.click(screen.getByRole("button", { name: "Nuevo producto" }));
    const dialogo = await screen.findByRole("dialog");
    // las categorías inactivas no se ofrecen en productos nuevos
    expect(within(dialogo).queryByRole("option", { name: "Descontinuados" })).not.toBeInTheDocument();
    await usuario.type(within(dialogo).getByLabelText("Código"), "mem-064");
    await usuario.type(within(dialogo).getByLabelText("Nombre"), "Memoria 64 GB");
    await usuario.clear(within(dialogo).getByLabelText("Precio de venta (sin IVA)"));
    await usuario.type(within(dialogo).getByLabelText("Precio de venta (sin IVA)"), "25");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar producto" }));

    expect(await screen.findByText("MEM-064")).toBeInTheDocument();
    const post = peticiones.find((p) => p.metodo === "POST")!;
    expect(post.cuerpo).toMatchObject({ codigo: "MEM-064", nombre: "Memoria 64 GB", precioVenta: "25.00" });
  });

  it("valida el código en el formulario antes de enviar", async () => {
    const peticiones = simularApi({ [PRODUCTOS]: { cuerpo: [] }, [CATEGORIAS]: { cuerpo: [] } });
    const { usuario } = abrir();
    await screen.findByText(/Todavía no hay productos/);

    await usuario.click(screen.getByRole("button", { name: "Nuevo producto" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Código"), "con espacio");
    await usuario.type(within(dialogo).getByLabelText("Nombre"), "Algo");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar producto" }));

    expect(await within(dialogo).findByText(/Usa solo letras, números/)).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("muestra el error de código repetido que devuelve la API", async () => {
    simularApi({
      [PRODUCTOS]: { cuerpo: [CELULAR] },
      [CATEGORIAS]: { cuerpo: [] },
      [`POST /empresas/${E}/productos`]: {
        estado: 409,
        cuerpo: { message: "Ya existe un producto con el código CEL-001 en esta empresa." },
      },
    });
    const { usuario } = abrir();
    await screen.findByText("CEL-001");

    await usuario.click(screen.getByRole("button", { name: "Nuevo producto" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Código"), "CEL-001");
    await usuario.type(within(dialogo).getByLabelText("Nombre"), "Otro celular");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar producto" }));

    expect(
      await within(dialogo).findByText(/Ya existe un producto con el código CEL-001/),
    ).toBeInTheDocument();
  });

  it("edita solo el campo que cambió y puede quitar la categoría", async () => {
    const peticiones = simularApi({
      [PRODUCTOS]: { cuerpo: [CELULAR] },
      [CATEGORIAS]: { cuerpo: [TELEFONOS] },
      [`PATCH /empresas/${E}/productos/p1`]: { cuerpo: { ...CELULAR, categoriaId: null, categoria: null } },
    });
    const { usuario } = abrir();
    await screen.findByText("CEL-001");

    await usuario.click(screen.getByRole("button", { name: "Editar Celular básico" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.selectOptions(within(dialogo).getByLabelText("Categoría"), "");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar producto" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ categoriaId: null });
  });

  it("inactiva un producto con un solo clic", async () => {
    const peticiones = simularApi({
      [PRODUCTOS]: { cuerpo: [CELULAR] },
      [CATEGORIAS]: { cuerpo: [] },
      [`PATCH /empresas/${E}/productos/p1`]: { cuerpo: { ...CELULAR, activo: false } },
    });
    const { usuario } = abrir();
    await screen.findByText("CEL-001");

    await usuario.click(screen.getByRole("button", { name: "Inactivar Celular básico" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ activo: false });
  });

  it("administra las categorías: lista con su número de productos, agrega e inactiva", async () => {
    let categorias = [TELEFONOS, VIEJA];
    const peticiones = simularApi({
      [PRODUCTOS]: { cuerpo: [] },
      [CATEGORIAS]: () => ({ cuerpo: categorias }),
      [`POST /empresas/${E}/categorias-producto`]: ({ cuerpo }) => {
        const nueva = categoria("c3", (cuerpo as { nombre: string }).nombre);
        categorias = [...categorias, nueva];
        return { estado: 201, cuerpo: nueva };
      },
      [`PATCH /empresas/${E}/categorias-producto/c1`]: { cuerpo: { ...TELEFONOS, activa: false } },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Categorías" }));
    const dialogo = await screen.findByRole("dialog");

    const lista = within(await within(dialogo).findByRole("list", { name: "Categorías de producto" }));
    expect(lista.getByText("1 producto")).toBeInTheDocument();
    expect(lista.getByText("Inactiva")).toBeInTheDocument();

    await usuario.type(within(dialogo).getByLabelText("Nombre de la nueva categoría"), "Accesorios");
    await usuario.click(within(dialogo).getByRole("button", { name: "Agregar categoría" }));
    expect(await within(dialogo).findByText("Accesorios")).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({ nombre: "Accesorios" });

    await usuario.click(within(dialogo).getByRole("button", { name: "Inactivar categoría Teléfonos" }));
    await waitFor(() =>
      expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ activa: false }),
    );
  });
});
