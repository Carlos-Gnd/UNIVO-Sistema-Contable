import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaCatalogo } from "./pantalla-catalogo";

const EMPRESA = "empresa-1";
const RUTA_CUENTAS = `GET /empresas/${EMPRESA}/cuentas`;
const respuestaCuentas = [
  { id: "1", codigo: "1", nombre: "Activo", nivel: 1, cuentaPadreId: null, activa: true },
  { id: "2", codigo: "11", nombre: "Activo corriente", nivel: 2, cuentaPadreId: "1", activa: true },
  { id: "3", codigo: "1101", nombre: "Efectivo", nivel: 3, cuentaPadreId: "2", activa: true },
];

describe("pantalla del catálogo (S1-T72)", () => {
  it("carga las cuentas de la empresa desde la API y muestra el árbol", async () => {
    const peticiones = simularApi({ [RUTA_CUENTAS]: { cuerpo: respuestaCuentas } });
    const { usuario } = renderizar(<PantallaCatalogo parametros={{ empresaId: EMPRESA }} />);

    expect(await screen.findByRole("heading", { name: "Catálogo de cuentas" })).toBeInTheDocument();
    expect(await screen.findByRole("row", { name: /Activo corriente/ })).toBeInTheDocument();
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]).toMatchObject({ metodo: "GET", ruta: `/empresas/${EMPRESA}/cuentas` });

    await usuario.click(screen.getByRole("button", { name: "Expandir todo" }));
    expect(screen.getByRole("row", { name: /1101 Efectivo Imputable/ })).toBeInTheDocument();
  });

  it("muestra el error de carga y permite reintentar", async () => {
    let intentos = 0;
    simularApi({
      [RUTA_CUENTAS]: () => {
        intentos += 1;
        return intentos === 1
          ? { estado: 500, cuerpo: { message: "Error del servidor" } }
          : { cuerpo: respuestaCuentas };
      },
    });
    const { usuario } = renderizar(<PantallaCatalogo parametros={{ empresaId: EMPRESA }} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las cuentas.");
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("row", { name: /Activo corriente/ })).toBeInTheDocument();
  });
});
