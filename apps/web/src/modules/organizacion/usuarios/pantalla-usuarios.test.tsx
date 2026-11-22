import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { MiembroEmpresa, SucursalDetalle } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaUsuarios } from "./pantalla-usuarios";

const E = "e1";
const LISTA = `GET /empresas/${E}/usuarios`;
const SUCURSALES = `GET /empresas/${E}/sucursales`;

const sucursal = (id: string, nombre: string, activa = true): SucursalDetalle => ({
  id,
  empresaId: E,
  nombre,
  codigoEstablecimiento: "S001",
  codigoPuntoVenta: "P001",
  direccion: null,
  esMatriz: false,
  activa,
  creadoEn: "2026-11-10T00:00:00.000Z",
  actualizadoEn: "2026-11-10T00:00:00.000Z",
});

const miembro = (usuarioId: string, nombre: string, extra: Partial<MiembroEmpresa> = {}): MiembroEmpresa => ({
  usuarioId,
  nombre,
  correo: `${nombre.toLowerCase().split(" ")[0]}@cherophonex.sv`,
  rol: "administrador",
  todasSucursales: true,
  sucursales: [],
  desde: "2026-11-10T00:00:00.000Z",
  ...extra,
});

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
const MATRIZ = sucursal(S1, "Casa matriz");
const USULUTAN = sucursal(S2, "Usulután");
const LA_UNION = sucursal(S3, "La Unión", false);
const ANA = miembro("u1", "Ana Romero");
const LUIS = miembro("u2", "Luis Pérez", { rol: "auxiliar", todasSucursales: false, sucursales: [S2] });

const abrir = () => renderizar(<PantallaUsuarios parametros={{ empresaId: E }} />);

const filas = async () =>
  (await screen.findAllByRole("row")).slice(1).map((fila) =>
    within(fila)
      .getAllByRole("cell")
      .slice(0, 3)
      .map((c) => c.textContent),
  );

describe("pantalla de usuarios (S1-T48)", () => {
  it("lista los usuarios con su rol y sus sucursales", async () => {
    simularApi({ [LISTA]: { cuerpo: [ANA, LUIS] }, [SUCURSALES]: { cuerpo: [MATRIZ, USULUTAN] } });
    abrir();

    await screen.findByText("Usulután");
    expect(await filas()).toEqual([
      ["Ana Romeroana@cherophonex.sv", "Administrador", "Todas las sucursales"],
      ["Luis Pérezluis@cherophonex.sv", "Auxiliar contable", "Usulután"],
    ]);
  });

  it("muestra el error de carga con opción de reintentar", async () => {
    simularApi({
      [LISTA]: { estado: 403, cuerpo: { message: "No tiene permiso para ver los usuarios de esta empresa" } },
      [SUCURSALES]: { cuerpo: [] },
    });
    abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent("No tiene permiso para ver los usuarios");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("invita a un auxiliar con sus sucursales, ofreciendo solo las activas", async () => {
    let lista = [ANA];
    const peticiones = simularApi({
      [LISTA]: () => ({ cuerpo: lista }),
      [SUCURSALES]: { cuerpo: [MATRIZ, USULUTAN, LA_UNION] },
      [`POST /empresas/${E}/usuarios/invitaciones`]: () => {
        lista = [
          ...lista,
          miembro("u3", "nuevo", { rol: "auxiliar", todasSucursales: false, sucursales: [S2] }),
        ];
        return { estado: 201, cuerpo: { mensaje: "Invitación enviada", invitacionEnviada: true } };
      },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Invitar usuario" }));
    const dialogo = screen.getByRole("dialog", { name: "Invitar usuario" });
    await usuario.type(within(dialogo).getByLabelText("Correo electrónico"), "Nuevo@CheroPhonex.sv");
    expect(within(dialogo).getByRole("radio", { name: /Auxiliar contable/ })).toBeChecked();
    expect(within(dialogo).queryByRole("checkbox", { name: /La Unión/ })).not.toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole("checkbox", { name: /Usulután/ }));
    await usuario.click(within(dialogo).getByRole("button", { name: "Enviar invitación" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toEqual({
      correo: "nuevo@cherophonex.sv",
      rol: "auxiliar",
      sucursales: [S2],
    });
    expect(await screen.findByText("nuevo")).toBeInTheDocument();
  });

  it("exige al menos una sucursal para el auxiliar antes de enviar", async () => {
    const peticiones = simularApi({ [LISTA]: { cuerpo: [ANA] }, [SUCURSALES]: { cuerpo: [MATRIZ] } });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Invitar usuario" }));
    const dialogo = screen.getByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Correo electrónico"), "otra@cherophonex.sv");
    await usuario.click(within(dialogo).getByRole("button", { name: "Enviar invitación" }));

    expect(within(dialogo).getByText("Asigne al menos una sucursal.")).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("muestra el conflicto que devuelve la API al invitar", async () => {
    simularApi({
      [LISTA]: { cuerpo: [ANA] },
      [SUCURSALES]: { cuerpo: [MATRIZ] },
      [`POST /empresas/${E}/usuarios/invitaciones`]: {
        estado: 409,
        cuerpo: { message: "El usuario ya pertenece a esta empresa" },
      },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "Invitar usuario" }));
    const dialogo = screen.getByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Correo electrónico"), "ana@cherophonex.sv");
    await usuario.click(within(dialogo).getByRole("radio", { name: /Contador/ }));
    expect(within(dialogo).getByText(/trabaja con todas las sucursales/)).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole("button", { name: "Enviar invitación" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "El usuario ya pertenece a esta empresa",
    );
  });
});

describe("diálogo de asignación de rol y sucursales (S1-T49)", () => {
  it("cambia un auxiliar a contador y deja de enviar sus sucursales", async () => {
    const peticiones = simularApi({
      [LISTA]: { cuerpo: [ANA, LUIS] },
      [SUCURSALES]: { cuerpo: [MATRIZ, USULUTAN] },
      [`PATCH /empresas/${E}/usuarios/u2`]: { cuerpo: { mensaje: "ok" } },
    });
    const { usuario } = abrir();

    await usuario.click(
      await screen.findByRole("button", { name: "Cambiar rol y sucursales de Luis Pérez" }),
    );
    const dialogo = screen.getByRole("dialog", { name: "Rol y sucursales" });
    expect(within(dialogo).getByRole("checkbox", { name: /Usulután/ })).toBeChecked();
    await usuario.click(within(dialogo).getByRole("radio", { name: /Contador/ }));
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({ rol: "contador", sucursales: [] });
  });

  it("cambia las sucursales de un usuario de consulta", async () => {
    const peticiones = simularApi({
      [LISTA]: { cuerpo: [LUIS] },
      [SUCURSALES]: { cuerpo: [MATRIZ, USULUTAN] },
      [`PATCH /empresas/${E}/usuarios/u2`]: { cuerpo: { mensaje: "ok" } },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: /Cambiar rol y sucursales/ }));
    const dialogo = screen.getByRole("dialog");
    await usuario.click(within(dialogo).getByRole("radio", { name: /Solo consulta/ }));
    await usuario.click(within(dialogo).getByRole("checkbox", { name: /Casa matriz/ }));
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(true));
    expect(peticiones.find((p) => p.metodo === "PATCH")?.cuerpo).toEqual({
      rol: "consulta",
      sucursales: [S2, S1],
    });
  });

  it("avisa cuando no hay cambios y no llama a la API", async () => {
    const peticiones = simularApi({ [LISTA]: { cuerpo: [ANA] }, [SUCURSALES]: { cuerpo: [MATRIZ] } });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: /Cambiar rol y sucursales/ }));
    const dialogo = screen.getByRole("dialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(within(dialogo).getByRole("alert")).toHaveTextContent("No hay cambios que guardar.");
    expect(peticiones.some((p) => p.metodo === "PATCH")).toBe(false);
  });

  it("muestra el rechazo de la API al quitar al único administrador", async () => {
    simularApi({
      [LISTA]: { cuerpo: [ANA] },
      [SUCURSALES]: { cuerpo: [MATRIZ] },
      [`PATCH /empresas/${E}/usuarios/u1`]: {
        estado: 409,
        cuerpo: { message: "La empresa debe conservar al menos un administrador." },
      },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: /Cambiar rol y sucursales/ }));
    const dialogo = screen.getByRole("dialog");
    await usuario.click(within(dialogo).getByRole("radio", { name: /Contador/ }));
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(
      await within(dialogo).findByText("La empresa debe conservar al menos un administrador."),
    ).toBeVisible();
  });
});
