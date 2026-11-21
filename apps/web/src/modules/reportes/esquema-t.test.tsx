import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibroMayor } from "@contable/shared";
import { EsquemaT } from "./esquema-t";

const libro: LibroMayor = {
  cuentaId: "cuenta-1",
  codigo: "11010301",
  nombre: "Banco Agrícola · cuenta corriente",
  naturaleza: "deudora",
  desde: "2026-11-01",
  hasta: "2026-11-30",
  saldoInicial: "0.00",
  totalDebe: "26120.00",
  totalHaber: "7374.00",
  saldoFinal: "18746.00",
  movimientos: [
    movimiento({ numero: 1, debe: "20000.00" }),
    movimiento({ numero: 7, haber: "904.00" }),
    movimiento({ numero: 8, haber: "5000.00" }),
    movimiento({ numero: 9, debe: "6000.00" }),
    movimiento({ numero: 10, haber: "120.00" }),
    movimiento({ numero: 11, debe: "120.00" }),
    movimiento({ numero: 12, haber: "1350.00" }),
  ],
};

function movimiento({
  numero,
  debe = "0.00",
  haber = "0.00",
}: {
  numero: number;
  debe?: string;
  haber?: string;
}) {
  return {
    fecha: "2026-11-01",
    partidaId: `partida-${numero}`,
    numero,
    tipo: "operacion" as const,
    concepto: "Movimiento de prueba",
    sucursalId: "sucursal-1",
    sucursal: "Casa matriz",
    cuentaCodigo: "11010301",
    cuentaNombre: "Banco Agrícola · cuenta corriente",
    debe,
    haber,
    saldo: "0.00",
  };
}

describe("EsquemaT", () => {
  it("separa los débitos y créditos y muestra sumas y saldo final", () => {
    render(
      <EsquemaT
        libro={libro}
        datos={{ empresa: "CheroPhonex, S.A. de C.V.", sucursal: "San Miguel Centro" }}
      />,
    );

    expect(screen.getByRole("heading", { name: /Mayor · 11010301 Banco Agrícola/ })).toBeInTheDocument();
    const listaDebe = within(screen.getByRole("list", { name: "Movimientos de Debe" }));
    const listaHaber = within(screen.getByRole("list", { name: "Movimientos de Haber" }));
    expect(listaDebe.getAllByRole("listitem")).toHaveLength(3);
    expect(listaHaber.getAllByRole("listitem")).toHaveLength(4);
    expect(listaDebe.getByText("1")).toBeInTheDocument();
    expect(listaHaber.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("26,120.00")).toBeInTheDocument();
    expect(screen.getByText("7,374.00")).toBeInTheDocument();
    expect(screen.getByText("18,746.00")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("muestra el aviso cuando el saldo final contradice la naturaleza de la cuenta", () => {
    render(<EsquemaT libro={{ ...libro, saldoFinal: "-125.00" }} datos={{ empresa: "CheroPhonex" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "1 cuenta tiene saldo contrario a su naturaleza: 11010301 Banco Agrícola · cuenta corriente",
    );
  });

  it("coloca el saldo acreedor en el lado Haber", () => {
    render(
      <EsquemaT
        libro={{ ...libro, naturaleza: "acreedora", saldoFinal: "250.00" }}
        datos={{ empresa: "CheroPhonex" }}
      />,
    );

    const filaSaldo = screen.getByText("Saldo").parentElement?.parentElement;
    expect(filaSaldo?.children[0]).not.toHaveTextContent("250.00");
    expect(filaSaldo?.children[1]).toHaveTextContent("250.00");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("muestra alerta para una cuenta acreedora con saldo negativo", () => {
    render(
      <EsquemaT
        libro={{ ...libro, naturaleza: "acreedora", saldoFinal: "-250.00" }}
        datos={{ empresa: "CheroPhonex" }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "1 cuenta tiene saldo contrario a su naturaleza: 11010301 Banco Agrícola · cuenta corriente",
    );
  });

  it("incluye el saldo inicial en el lado correspondiente y en la suma", () => {
    render(
      <EsquemaT
        libro={{
          ...libro,
          saldoInicial: "1000.00",
          totalDebe: "200.00",
          totalHaber: "50.00",
          saldoFinal: "1150.00",
          movimientos: [
            movimiento({ numero: 20, debe: "200.00" }),
            movimiento({ numero: 21, haber: "50.00" }),
          ],
        }}
        datos={{ empresa: "CheroPhonex" }}
      />,
    );

    const listaDebe = within(screen.getByRole("list", { name: "Movimientos de Debe" }));
    const primerRenglonDebe = listaDebe.getAllByRole("listitem")[0];
    expect(primerRenglonDebe).toHaveTextContent("Saldo inicial");
    expect(primerRenglonDebe).toHaveTextContent("1,000.00");
    expect(listaDebe.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("1,200.00")).toBeInTheDocument();
    expect(screen.getAllByText("50.00")).toHaveLength(2);
    expect(screen.getByText("1,150.00")).toBeInTheDocument();
  });

  it("coloca la etiqueta Saldo junto al importe del lado Haber", () => {
    render(
      <EsquemaT
        libro={{ ...libro, naturaleza: "acreedora", saldoFinal: "250.00" }}
        datos={{ empresa: "CheroPhonex" }}
      />,
    );

    const filaSaldo = screen.getByText("Saldo").parentElement?.parentElement;
    expect(filaSaldo?.children[0]).not.toHaveTextContent("Saldo");
    expect(filaSaldo?.children[1]).toHaveTextContent("Saldo250.00");
  });
});
