import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { SucursalDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaPartida } from "./pantalla-partida";
import type { CuentaCatalogo, PartidaVista } from "./tipos";

const E = "e1";
const ID = {
  c_efectivo: "10000000-0000-4000-8000-000000000001",
  c_caja: "10000000-0000-4000-8000-000000000002",
  c_bancos: "10000000-0000-4000-8000-000000000003",
  c_chica: "10000000-0000-4000-8000-000000000004",
  c_luz: "10000000-0000-4000-8000-000000000005",
  s_matriz: "20000000-0000-4000-8000-000000000001",
  s_centro: "20000000-0000-4000-8000-000000000002",
  s_cerrada: "20000000-0000-4000-8000-000000000003",
  s_otra: "20000000-0000-4000-8000-000000000004",
};

const AUXILIAR: CodigoPermiso[] = ["partidas.ver", "partidas.registrar"];

const sucursal = (id: string, nombre: string, extra: Partial<SucursalDetalle> = {}): SucursalDetalle => ({
  id,
  empresaId: E,
  nombre,
  codigoEstablecimiento: nombre.slice(0, 4).toUpperCase(),
  codigoPuntoVenta: "0001",
  direccion: null,
  esMatriz: false,
  activa: true,
  creadoEn: "2026-11-10T00:00:00.000Z",
  actualizadoEn: "2026-11-10T00:00:00.000Z",
  ...extra,
});

const cuenta = (
  id: string,
  codigo: string,
  nombre: string,
  extra: Partial<CuentaCatalogo> = {},
): CuentaCatalogo => ({
  id,
  codigo,
  nombre,
  nivel: codigo.length,
  naturaleza: "deudora",
  tipo: "activo",
  cuentaPadreId: null,
  activa: true,
  ...extra,
});

const CUENTAS = [
  cuenta(ID.c_efectivo, "1101", "Efectivo y equivalentes"),
  cuenta(ID.c_caja, "110101", "Caja general", { cuentaPadreId: ID.c_efectivo }),
  cuenta(ID.c_bancos, "110102", "Bancos", { cuentaPadreId: ID.c_efectivo }),
  cuenta(ID.c_chica, "110103", "Caja chica", { cuentaPadreId: ID.c_efectivo, activa: false }),
  cuenta(ID.c_luz, "5101", "Energía eléctrica", { tipo: "costos_gastos" }),
];

const borrador = (extra: Partial<PartidaVista> = {}): PartidaVista => ({
  id: "p1",
  sucursalId: ID.s_matriz,
  fecha: "2026-11-09",
  tipo: "operacion",
  estado: "borrador",
  numero: null,
  concepto: "Pago de energía eléctrica",
  documentoTipo: "CCF",
  documentoNumero: "123",
  origen: "manual",
  lineas: [
    {
      cuentaId: ID.c_luz,
      codigo: "5101",
      nombre: "Energía eléctrica",
      debe: "85.40",
      haber: "0.00",
      concepto: null,
    },
    {
      cuentaId: ID.c_caja,
      codigo: "110101",
      nombre: "Caja general",
      debe: "0.00",
      haber: "85.40",
      concepto: null,
    },
  ],
  totalDebe: "85.40",
  totalHaber: "85.40",
  diferencia: "0.00",
  cuadra: true,
  creadoEn: "2026-11-09T10:00:00.000Z",
  actualizadoEn: "2026-11-09T10:00:00.000Z",
  ...extra,
});

const BASE = {
  [`GET /empresas/${E}/cuentas`]: { cuerpo: CUENTAS },
  [`GET /empresas/${E}/sucursales`]: {
    cuerpo: [
      sucursal(ID.s_matriz, "Casa matriz", { esMatriz: true }),
      sucursal(ID.s_centro, "San Miguel Centro"),
      sucursal(ID.s_cerrada, "La Unión", { activa: false }),
    ],
  },
};

function abrirNueva(permisos: CodigoPermiso[] = AUXILIAR, opciones = {}) {
  return renderizar(<PantallaPartida parametros={{ empresaId: E }} />, { permisos, ...opciones });
}

/** El botón se habilita cuando el catálogo terminó de cargar. */
async function botonAgregar() {
  const boton = await screen.findByRole("button", { name: "Agregar cuenta" });
  await waitFor(() => expect(boton).toBeEnabled());
  return boton;
}

async function agregarCuenta(
  usuario: ReturnType<typeof renderizar>["usuario"],
  busqueda: string,
  nombre: string,
) {
  await usuario.click(await botonAgregar());
  await usuario.type(screen.getByRole("combobox", { name: "Código o nombre de la cuenta" }), busqueda);
  await usuario.click(await screen.findByRole("option", { name: new RegExp(nombre) }));
}

describe("registro de partidas (HU-20)", () => {
  beforeEach(() => window.history.replaceState(null, "", `/empresas/${E}/partidas/nueva`));

  describe("cabecera (S1-T79)", () => {
    it("propone la fecha de hoy, el tipo operación y la casa matriz, y ofrece los seis tipos", async () => {
      simularApi(BASE);
      abrirNueva();

      expect(await screen.findByRole("heading", { name: "Nueva partida" })).toBeInTheDocument();
      expect(await screen.findByLabelText("Sucursal")).toHaveValue(ID.s_matriz);
      expect(screen.getByLabelText("Tipo")).toHaveValue("operacion");
      expect(screen.getByLabelText("Fecha")).toHaveValue(new Date().toLocaleDateString("en-CA"));
      expect(
        within(screen.getByLabelText("Tipo"))
          .getAllByRole("option")
          .map((o) => o.textContent),
      ).toEqual(["Apertura", "Operación", "Ajuste", "Cierre", "Reapertura", "Reversión"]);
      expect(screen.getByText("Sin número · se asigna al contabilizar")).toBeInTheDocument();
    });

    it("solo ofrece las sucursales activas asignadas al auxiliar", async () => {
      simularApi(BASE);
      abrirNueva(AUXILIAR, { todasSucursales: false, sucursales: [ID.s_centro, ID.s_cerrada] });

      const selector = await screen.findByLabelText("Sucursal");
      const opciones = within(selector)
        .getAllByRole("option")
        .map((o) => o.textContent);
      expect(opciones).toEqual(["Elige una sucursal", "San Miguel Centro · SAN "]);
      // Con una sola sucursal disponible se elige sola
      expect(selector).toHaveValue(ID.s_centro);
    });
  });

  describe("detalle con búsqueda de cuentas (S1-T80)", () => {
    it("busca por código o nombre y solo muestra cuentas activas de último nivel", async () => {
      simularApi(BASE);
      const { usuario } = abrirNueva();

      await usuario.click(await botonAgregar());
      const buscador = screen.getByRole("combobox", { name: "Código o nombre de la cuenta" });
      expect(
        within(screen.getByRole("listbox"))
          .getAllByRole("option")
          .map((o) => o.textContent)
          .join("|"),
      ).toBe("110101Caja generalDeudora|110102BancosDeudora|5101Energía eléctricaDeudora");

      await usuario.type(buscador, "energia");
      expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1);

      await usuario.clear(buscador);
      await usuario.type(buscador, "zzz");
      expect(screen.getByText("Sin cuentas activas de último nivel con «zzz».")).toBeInTheDocument();
    });

    it("agrega con el teclado y quita líneas", async () => {
      simularApi(BASE);
      const { usuario } = abrirNueva();

      await usuario.click(await botonAgregar());
      await usuario.type(screen.getByRole("combobox", { name: "Código o nombre de la cuenta" }), "1101");
      await usuario.keyboard("{ArrowDown}{Enter}");

      expect(screen.getByRole("textbox", { name: "Debe de 110102 Bancos" })).toBeInTheDocument();
      await usuario.click(screen.getByRole("button", { name: "Quitar 110102 Bancos" }));
      expect(screen.queryByRole("textbox", { name: "Debe de 110102 Bancos" })).not.toBeInTheDocument();
      expect(screen.getByText("Agrega las cuentas de la partida.")).toBeInTheDocument();
    });

    it("una línea va al debe o al haber, no a los dos", async () => {
      simularApi(BASE);
      const { usuario } = abrirNueva();
      await agregarCuenta(usuario, "caja", "Caja general");

      await usuario.type(screen.getByRole("textbox", { name: "Debe de 110101 Caja general" }), "10");
      expect(screen.getByRole("textbox", { name: "Haber de 110101 Caja general" })).toBeDisabled();
    });
  });

  describe("totales en vivo (S1-T81)", () => {
    it("recalcula debe, haber y la diferencia al escribir, con montos exactos", async () => {
      simularApi(BASE);
      const { usuario } = abrirNueva();
      await agregarCuenta(usuario, "5101", "Energía");
      await agregarCuenta(usuario, "bancos", "Bancos");
      await agregarCuenta(usuario, "caja", "Caja general");

      expect(screen.getByTestId("estado-cuadre")).toHaveTextContent(
        "Escribe los montos del debe y del haber.",
      );
      await usuario.type(screen.getByRole("textbox", { name: "Debe de 5101 Energía eléctrica" }), "0.30");
      await usuario.type(screen.getByRole("textbox", { name: "Haber de 110102 Bancos" }), "0.1");

      expect(screen.getByTestId("total-debe")).toHaveTextContent("0.30");
      expect(screen.getByTestId("total-haber")).toHaveTextContent("0.10");
      expect(screen.getByTestId("estado-cuadre")).toHaveTextContent(
        "Diferencia US$ 0.20 · puedes guardarla como borrador",
      );

      await usuario.type(screen.getByRole("textbox", { name: "Haber de 110101 Caja general" }), "0.2");
      expect(screen.getByTestId("total-haber")).toHaveTextContent("0.30");
      expect(screen.getByTestId("estado-cuadre")).toHaveTextContent("La partida cuadra");
    });

    it("limpia lo que no es monto y formatea al salir del campo", async () => {
      simularApi(BASE);
      const { usuario } = abrirNueva();
      await agregarCuenta(usuario, "caja", "Caja general");

      const debe = screen.getByRole("textbox", { name: "Debe de 110101 Caja general" });
      await usuario.type(debe, "1a2345.678");
      expect(debe).toHaveValue("12345.67");
      await usuario.tab();
      expect(debe).toHaveValue("12,345.67");
      expect(screen.getByTestId("total-debe")).toHaveTextContent("12,345.67");
      expect(screen.getByTestId("estado-cuadre")).toHaveTextContent("Agrega al menos dos cuentas.");
    });
  });

  describe("guardar borrador", () => {
    it("envía la partida normalizada, aunque esté descuadrada, y abre el borrador guardado", async () => {
      const peticiones = simularApi({
        ...BASE,
        [`POST /empresas/${E}/partidas`]: { estado: 201, cuerpo: borrador({ id: "nueva-1" }) },
      });
      const { usuario } = abrirNueva();
      await agregarCuenta(usuario, "5101", "Energía");
      await agregarCuenta(usuario, "caja", "Caja general");
      await usuario.type(screen.getByRole("textbox", { name: "Debe de 5101 Energía eléctrica" }), "100");
      await usuario.type(screen.getByRole("textbox", { name: "Haber de 110101 Caja general" }), "90.5");
      await usuario.type(screen.getByLabelText("Concepto"), "  Pago de energía  ");

      await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));

      await waitFor(() => expect(window.location.pathname).toBe(`/empresas/${E}/partidas/nueva-1`));
      const post = peticiones.find((p) => p.metodo === "POST");
      expect(post?.cuerpo).toEqual({
        sucursalId: ID.s_matriz,
        fecha: new Date().toLocaleDateString("en-CA"),
        tipo: "operacion",
        concepto: "Pago de energía",
        lineas: [
          { cuentaId: ID.c_luz, debe: "100.00", haber: "0.00" },
          { cuentaId: ID.c_caja, debe: "0.00", haber: "90.50" },
        ],
      });
    });

    it("no guarda líneas sin monto y lo indica en la línea", async () => {
      const peticiones = simularApi(BASE);
      const { usuario } = abrirNueva();
      await agregarCuenta(usuario, "caja", "Caja general");

      await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));

      expect(
        await screen.findByText("La línea no tiene monto en el debe ni en el haber."),
      ).toBeInTheDocument();
      expect(screen.getByText("Revisa los campos marcados.")).toBeInTheDocument();
      expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
    });

    it("exige la sucursal cuando no hay una propuesta", async () => {
      const peticiones = simularApi(BASE);
      const { usuario } = abrirNueva(AUXILIAR, {
        todasSucursales: false,
        sucursales: [ID.s_centro, ID.s_otra],
      });
      // s-otra no existe: queda una sola disponible y se propone; se quita para probar el mensaje
      const selector = await screen.findByLabelText("Sucursal");
      expect(selector).toHaveValue(ID.s_centro);
      selector.querySelector("option")?.removeAttribute("disabled");
      await usuario.selectOptions(selector, "");
      await agregarCuenta(usuario, "caja", "Caja general");
      await usuario.type(screen.getByRole("textbox", { name: "Debe de 110101 Caja general" }), "5");

      await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));

      expect(await screen.findByText("Elige la sucursal de la partida.")).toBeInTheDocument();
      expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
    });

    it("valida la fecha con el mensaje del esquema compartido", async () => {
      const peticiones = simularApi(BASE);
      const { usuario } = abrirNueva();
      await agregarCuenta(usuario, "caja", "Caja general");
      await usuario.type(screen.getByRole("textbox", { name: "Debe de 110101 Caja general" }), "5");
      await usuario.clear(screen.getByLabelText("Fecha"));

      await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));

      expect(await screen.findByText("La fecha debe tener el formato AAAA-MM-DD.")).toBeInTheDocument();
      expect(screen.getByLabelText("Fecha")).toHaveAttribute("aria-invalid", "true");
      expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
    });

    it("muestra en su línea los errores que devuelve la API y el motivo de las reglas contables", async () => {
      simularApi({
        ...BASE,
        [`POST /empresas/${E}/partidas`]: {
          estado: 422,
          cuerpo: {
            mensaje: "Corrija las líneas marcadas antes de guardar la partida.",
            lineas: [{ linea: 0, codigo: "CUENTA_INACTIVA", mensaje: "La cuenta está inactiva." }],
          },
        },
      });
      const { usuario } = abrirNueva();
      await agregarCuenta(usuario, "caja", "Caja general");
      await usuario.type(screen.getByRole("textbox", { name: "Debe de 110101 Caja general" }), "5");

      await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));

      expect(await screen.findByText("La cuenta está inactiva.")).toBeInTheDocument();
      expect(
        screen.getByText("Corrija las líneas marcadas antes de guardar la partida."),
      ).toBeInTheDocument();
    });

    it("informa el período cerrado que rechaza la base de datos", async () => {
      simularApi({
        ...BASE,
        [`POST /empresas/${E}/partidas`]: {
          estado: 422,
          cuerpo: { mensaje: "No hay un período abierto para la fecha 2026-11-13." },
        },
      });
      const { usuario } = abrirNueva();
      await agregarCuenta(usuario, "caja", "Caja general");
      await usuario.type(screen.getByRole("textbox", { name: "Debe de 110101 Caja general" }), "5");
      await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No hay un período abierto para la fecha 2026-11-13.",
      );
    });
  });

  describe("editar un borrador", () => {
    it("carga sus datos y guarda los cambios con PUT", async () => {
      window.history.replaceState(null, "", `/empresas/${E}/partidas/p1`);
      const peticiones = simularApi({
        ...BASE,
        [`GET /empresas/${E}/partidas/p1`]: { cuerpo: borrador() },
        [`PUT /empresas/${E}/partidas/p1`]: ({ cuerpo }) => ({
          cuerpo: borrador({
            concepto: (cuerpo as { concepto: string }).concepto,
            actualizadoEn: "2026-11-09T11:00:00Z",
          }),
        }),
      });
      const { usuario } = renderizar(<PantallaPartida parametros={{ empresaId: E, partidaId: "p1" }} />, {
        permisos: AUXILIAR,
      });

      // Mientras carga no se presenta como partida nueva
      expect(screen.getByRole("heading", { name: "Partida" })).toBeInTheDocument();
      expect(screen.queryByText("Sin número · se asigna al contabilizar")).not.toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: "Borrador de partida" })).toBeInTheDocument();
      expect(screen.getByLabelText("Concepto")).toHaveValue("Pago de energía eléctrica");
      expect(screen.getByRole("textbox", { name: "Debe de 5101 Energía eléctrica" })).toHaveValue("85.40");
      expect(screen.getByRole("textbox", { name: "Haber de 5101 Energía eléctrica" })).toHaveValue("");
      expect(screen.getByTestId("estado-cuadre")).toHaveTextContent("La partida cuadra");

      await usuario.clear(screen.getByLabelText("Concepto"));
      await usuario.type(screen.getByLabelText("Concepto"), "Energía de octubre");
      await usuario.click(screen.getByRole("button", { name: "Guardar borrador" }));

      await waitFor(() => expect(screen.getByLabelText("Concepto")).toHaveValue("Energía de octubre"));
      const put = peticiones.find((p) => p.metodo === "PUT");
      expect(put?.cuerpo).toMatchObject({ concepto: "Energía de octubre", documentoTipo: "CCF" });
      expect(window.location.pathname).toBe(`/empresas/${E}/partidas/p1`);
    });

    it("muestra una contabilizada en solo lectura con su número", async () => {
      simularApi({
        ...BASE,
        [`GET /empresas/${E}/partidas/p1`]: { cuerpo: borrador({ estado: "contabilizada", numero: 7 }) },
      });
      renderizar(<PantallaPartida parametros={{ empresaId: E, partidaId: "p1" }} />, { permisos: AUXILIAR });

      expect(await screen.findByRole("heading", { name: "Partida n.º 7" })).toBeInTheDocument();
      expect(screen.getByText("Contabilizada")).toBeInTheDocument();
      expect(
        screen.getByText("Las partidas contabilizadas o anuladas no se editan aquí."),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Concepto")).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Guardar borrador" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Agregar cuenta" })).not.toBeInTheDocument();
    });
  });

  describe("permisos y salida", () => {
    it("el rol de consulta solo ve la partida", async () => {
      simularApi({ ...BASE, [`GET /empresas/${E}/partidas/p1`]: { cuerpo: borrador() } });
      renderizar(<PantallaPartida parametros={{ empresaId: E, partidaId: "p1" }} />, {
        permisos: ["partidas.ver"],
      });

      expect(await screen.findByText("Tu rol solo permite ver las partidas.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Guardar borrador" })).not.toBeInTheDocument();
    });

    it("pide confirmación antes de salir con cambios sin guardar", async () => {
      simularApi(BASE);
      const { usuario } = abrirNueva();
      await agregarCuenta(usuario, "caja", "Caja general");

      await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

      const dialogo = await screen.findByRole("dialog", { name: "¿Salir sin guardar?" });
      await usuario.click(within(dialogo).getByRole("button", { name: "Seguir editando" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Debe de 110101 Caja general" })).toBeInTheDocument();
    });
  });
});
