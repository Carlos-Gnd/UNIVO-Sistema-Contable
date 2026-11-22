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
  });

  it("(S2-T26) dispone cada número y monto en su lado y omite movimientos en cero", () => {
    render(
      <EsquemaT
        libro={{
          ...libro,
          movimientos: [
            ...libro.movimientos,
            movimiento({ numero: 13 }),
            movimiento({ numero: 14, debe: "75.25" }),
            movimiento({ numero: 15, haber: "125.50" }),
          ],
        }}
        datos={{ empresa: "CheroPhonex" }}
      />,
    );

    const debe = within(screen.getByRole("list", { name: "Movimientos de Debe" }));
    const haber = within(screen.getByRole("list", { name: "Movimientos de Haber" }));
    const renglonesDebe = debe.getAllByRole("listitem");
    const renglonesHaber = haber.getAllByRole("listitem");

    expect(renglonesDebe.map((renglon) => renglon.firstElementChild?.textContent)).toEqual([
      "1",
      "9",
      "11",
      "14",
    ]);
    expect(renglonesHaber.map((renglon) => renglon.firstElementChild?.textContent)).toEqual([
      "7",
      "8",
      "10",
      "12",
      "15",
    ]);
    expect(renglonesDebe.map((renglon) => renglon.lastElementChild?.textContent)).toEqual([
      "20,000.00",
      "6,000.00",
      "120.00",
      "75.25",
    ]);
    expect(renglonesHaber.map((renglon) => renglon.lastElementChild?.textContent)).toEqual([
      "904.00",
      "5,000.00",
      "120.00",
      "1,350.00",
      "125.50",
    ]);
    expect(debe.queryByText("13")).not.toBeInTheDocument();
    expect(haber.queryByText("13")).not.toBeInTheDocument();
    expect(debe.queryByText("15")).not.toBeInTheDocument();
    expect(haber.queryByText("14")).not.toBeInTheDocument();
  });

  it("(S2-T26) conserva el saldo inicial acreedor en Haber y lo suma a ese lado", () => {
    render(
      <EsquemaT
        libro={{
          ...libro,
          naturaleza: "acreedora",
          saldoInicial: "500.00",
          totalDebe: "200.00",
          totalHaber: "50.00",
          saldoFinal: "350.00",
          movimientos: [movimiento({ numero: 1, debe: "200.00" }), movimiento({ numero: 2, haber: "50.00" })],
        }}
        datos={{ empresa: "CheroPhonex" }}
      />,
    );

    const debe = within(screen.getByRole("list", { name: "Movimientos de Debe" }));
    const haber = within(screen.getByRole("list", { name: "Movimientos de Haber" }));
    const renglonesHaber = haber.getAllByRole("listitem");

    expect(debe.getAllByRole("listitem")).toHaveLength(1);
    expect(debe.getByText("1").nextElementSibling).toHaveTextContent("200.00");
    expect(renglonesHaber).toHaveLength(2);
    expect(renglonesHaber[0]).toHaveTextContent("Saldo inicial");
    expect(renglonesHaber[0]).toHaveTextContent("500.00");
    expect(renglonesHaber[1]).toHaveTextContent("2");
    expect(renglonesHaber[1]).toHaveTextContent("50.00");
    expect(screen.getAllByText("200.00")).toHaveLength(2);
    expect(screen.getByText("550.00")).toBeInTheDocument();
    expect(screen.getByText("350.00")).toBeInTheDocument();
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
