import { describe, expect, it } from "vitest";
import { filtrarCuentasPorBusqueda } from "./busqueda-cuentas";

const cuentas = [
  { id: "activo", codigo: "1", nombre: "Activo", cuentaPadreId: null },
  { id: "corriente", codigo: "11", nombre: "Activo corriente", cuentaPadreId: "activo" },
  { id: "caja", codigo: "1101", nombre: "Efectivo y equivalentes", cuentaPadreId: "corriente" },
  { id: "caja-general", codigo: "110101", nombre: "Caja general", cuentaPadreId: "caja" },
  { id: "pasivo", codigo: "2", nombre: "Pasivo", cuentaPadreId: null },
  { id: "gastos", codigo: "6", nombre: "Gastos", cuentaPadreId: null },
  { id: "depreciacion", codigo: "6101", nombre: "Depreciación", cuentaPadreId: "gastos" },
];

describe("filtrarCuentasPorBusqueda", () => {
  it("devuelve todo el catálogo cuando la consulta está vacía", () => {
    expect(filtrarCuentasPorBusqueda(cuentas, "  ")).toEqual(cuentas);
  });

  it("busca por código y conserva las cuentas antecesoras", () => {
    expect(filtrarCuentasPorBusqueda(cuentas, "110101").map((cuenta) => cuenta.id)).toEqual([
      "activo",
      "corriente",
      "caja",
      "caja-general",
    ]);
  });

  it("busca por nombre sin distinguir mayúsculas ni tildes", () => {
    expect(filtrarCuentasPorBusqueda(cuentas, "DEPRECIACION").map((cuenta) => cuenta.id)).toEqual([
      "gastos",
      "depreciacion",
    ]);
  });

  it("devuelve una lista vacía si no hay coincidencias", () => {
    expect(filtrarCuentasPorBusqueda(cuentas, "bancos inexistentes")).toEqual([]);
  });
});
