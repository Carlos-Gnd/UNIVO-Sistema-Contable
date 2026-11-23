import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertaSaldoContrario } from "./alerta-saldo-contrario";

describe("AlertaSaldoContrario", () => {
  it("no muestra alerta si la lista está vacía", () => {
    const { container } = render(<AlertaSaldoContrario cuentas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("resume varias cuentas con el conteo en plural", () => {
    render(
      <AlertaSaldoContrario
        cuentas={[
          { id: "c1", codigo: "110301", nombre: "Clientes locales" },
          { id: "c2", codigo: "210201", nombre: "Proveedores" },
        ]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "2 cuentas tienen saldo contrario a su naturaleza: 110301 Clientes locales, 210201 Proveedores",
    );
  });

  it("enlaza la cuenta cuando recibe una ruta", () => {
    render(
      <AlertaSaldoContrario
        cuentas={[{ id: "c1", codigo: "110301", nombre: "Clientes locales", href: "/cuentas/c1" }]}
      />,
    );

    expect(screen.getByRole("link", { name: "110301 Clientes locales" })).toHaveAttribute(
      "href",
      "/cuentas/c1",
    );
  });
});
