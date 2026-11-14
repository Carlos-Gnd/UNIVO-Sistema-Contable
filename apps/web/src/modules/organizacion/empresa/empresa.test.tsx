import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { EmpresaDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaEmpresa } from "./pantalla-empresa";
import { PantallaRegistrarEmpresa } from "./pantalla-registrar-empresa";

const EMPRESA: EmpresaDetalle = {
  id: "e1",
  nombre: "Comercial Oriente, S.A. de C.V.",
  nombreComercial: "Comercial Oriente",
  nit: "0614-010190-101-5",
  nrc: "123456-7",
  tipoContribuyente: "sociedad",
  clasificacion: "mediano",
  actividadEconomica: "46900 · Venta al por mayor de otros productos",
  direccion: "4.ª calle poniente n.º 12, San Miguel",
  telefono: "2661-4410",
  correo: null,
  logoUrl: null,
  modoNumeracion: "anual",
  activa: true,
  creadoEn: "2026-11-10T00:00:00.000Z",
  actualizadoEn: "2026-11-10T00:00:00.000Z",
};

describe("registro de empresa (S1-T41)", () => {
  beforeEach(() => window.history.replaceState(null, "", "/empresas/nueva"));

  it("registra con el NIT y el NRC formateados y la casa matriz por defecto", async () => {
    const peticiones = simularApi({ "POST /empresas": { estado: 201, cuerpo: { ...EMPRESA, id: "e9" } } });
    const { usuario } = renderizar(<PantallaRegistrarEmpresa />);

    await usuario.type(screen.getByLabelText("Razón social"), "Comercial Oriente, S.A. de C.V.");
    await usuario.type(screen.getByLabelText("NIT"), "06140101901015");
    await usuario.type(screen.getByLabelText("NRC"), "1234567");
    await usuario.tab();
    expect(screen.getByLabelText("NIT")).toHaveValue("0614-010190-101-5");
    expect(screen.getByLabelText("NRC")).toHaveValue("123456-7");
    await usuario.selectOptions(screen.getByLabelText("Clasificación"), "mediano");
    await usuario.click(screen.getByRole("button", { name: "Registrar empresa" }));

    await waitFor(() => expect(window.location.pathname).toBe("/empresas/e9"));
    expect(peticiones[0]?.cuerpo).toEqual({
      nombre: "Comercial Oriente, S.A. de C.V.",
      nit: "0614-010190-101-5",
      nrc: "123456-7",
      tipoContribuyente: "sociedad",
      clasificacion: "mediano",
      modoNumeracion: "anual",
      casaMatriz: { nombre: "Casa matriz", codigoEstablecimiento: "0001", codigoPuntoVenta: "0001" },
    });
  });

  it("valida el dígito verificador del NIT y los obligatorios antes de enviar", async () => {
    const peticiones = simularApi({});
    const { usuario } = renderizar(<PantallaRegistrarEmpresa />);

    await usuario.type(screen.getByLabelText("NIT"), "0614-010190-101-4");
    await usuario.click(screen.getByRole("button", { name: "Registrar empresa" }));

    expect(screen.getByLabelText("NIT")).toHaveAccessibleDescription(
      "El dígito verificador no es válido; revise el número.",
    );
    expect(screen.getByLabelText("Razón social")).toHaveAccessibleDescription("Este campo es obligatorio.");
    expect(screen.getByText("Revisa los campos marcados.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("una sociedad no se registra con DUI, una persona natural sí", async () => {
    const peticiones = simularApi({ "POST /empresas": { estado: 201, cuerpo: EMPRESA } });
    const { usuario } = renderizar(<PantallaRegistrarEmpresa />);

    await usuario.type(screen.getByLabelText("Razón social"), "José Pérez");
    await usuario.type(screen.getByLabelText("NIT"), "123456784");
    await usuario.click(screen.getByRole("button", { name: "Registrar empresa" }));
    expect(screen.getByLabelText("NIT")).toHaveAccessibleDescription(
      "Una sociedad se registra con su NIT de 14 dígitos, no con un DUI.",
    );

    await usuario.selectOptions(screen.getByLabelText("Tipo de contribuyente"), "persona_natural");
    expect(
      screen.getByText("El catálogo incluye las cuentas de capital y retiros del titular."),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Registrar empresa" }));

    await waitFor(() => expect(peticiones).toHaveLength(1));
    expect(peticiones[0]?.cuerpo).toMatchObject({ nit: "12345678-4", tipoContribuyente: "persona_natural" });
  });

  it("muestra en el NIT el duplicado que rechaza la API", async () => {
    simularApi({
      "POST /empresas": {
        estado: 409,
        cuerpo: { message: "Ya existe una empresa registrada con el NIT 0614-010190-101-5." },
      },
    });
    const { usuario } = renderizar(<PantallaRegistrarEmpresa />);
    await usuario.type(screen.getByLabelText("Razón social"), "Otra");
    await usuario.type(screen.getByLabelText("NIT"), "0614-010190-101-5");
    await usuario.click(screen.getByRole("button", { name: "Registrar empresa" }));

    await waitFor(() =>
      expect(screen.getByLabelText("NIT")).toHaveAccessibleDescription(
        "Ya existe una empresa registrada con el NIT 0614-010190-101-5.",
      ),
    );
  });

  it("valida los códigos de la casa matriz", async () => {
    simularApi({});
    const { usuario } = renderizar(<PantallaRegistrarEmpresa />);
    await usuario.clear(screen.getByLabelText("Código de establecimiento"));
    await usuario.type(screen.getByLabelText("Código de establecimiento"), "M1");
    await usuario.click(screen.getByRole("button", { name: "Registrar empresa" }));

    expect(screen.getByText("Debe tener 4 letras o dígitos, como 0001 o M001.")).toBeInTheDocument();
  });
});

describe("datos de la empresa (S1-T41)", () => {
  const abrir = (permisos: ("empresa.ver" | "empresa.configurar")[]) =>
    renderizar(<PantallaEmpresa parametros={{ empresaId: "e1" }} />, {
      permisos,
      rol: permisos.includes("empresa.configurar") ? "administrador" : "contador",
    });

  it("edita enviando solo lo que cambió y no permite cambiar el tipo de contribuyente", async () => {
    const peticiones = simularApi({
      "GET /empresas/e1": { cuerpo: EMPRESA },
      "PATCH /empresas/e1": ({ cuerpo }) => ({
        cuerpo: { ...EMPRESA, ...(cuerpo as object), actualizadoEn: "2026-11-11T00:00:00.000Z" },
      }),
    });
    const { usuario } = abrir(["empresa.ver", "empresa.configurar"]);

    const telefono = await screen.findByLabelText("Teléfono");
    expect(screen.getByLabelText("Tipo de contribuyente")).toBeDisabled();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();

    await usuario.clear(telefono);
    await usuario.type(telefono, "2661-4400");
    await usuario.clear(screen.getByLabelText("NRC"));
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled());
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({
      nrc: null,
      telefono: "2661-4400",
    });
    expect(screen.getByLabelText("Teléfono")).toHaveValue("2661-4400");
  });

  it("descarta los cambios", async () => {
    simularApi({ "GET /empresas/e1": { cuerpo: EMPRESA } });
    const { usuario } = abrir(["empresa.ver", "empresa.configurar"]);
    const nombre = await screen.findByLabelText("Razón social");
    await usuario.type(nombre, " (borrador)");
    await usuario.click(screen.getByRole("button", { name: "Descartar" }));
    expect(nombre).toHaveValue(EMPRESA.nombre);
  });

  it("sin empresa.configurar los datos son de solo lectura", async () => {
    simularApi({ "GET /empresas/e1": { cuerpo: EMPRESA } });
    abrir(["empresa.ver"]);

    expect(await screen.findByText("Solo el administrador puede modificar estos datos.")).toBeInTheDocument();
    expect(screen.getByLabelText("Razón social")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.getByText("Contador")).toBeInTheDocument();
  });
});
