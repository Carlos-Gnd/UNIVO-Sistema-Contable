import { describe, expect, it } from "vitest";
import { armarTablero, type DatosTablero } from "./tablero.js";

const datos: DatosTablero = {
  ventasNetas: "1000.00",
  costoVentas: "600.00",
  gastosOperacion: "130.00",
  costosFinancieros: "20.00",
  utilidadEjercicio: "250.00",
  efectivo: "875.45",
  ventasSemanales: [{ semana: 2, comprobantesCreditoFiscal: "300.00", consumidorFinal: "125.00" }],
  productos: [{ id: "p1", nombre: "Teléfono", utilidadBruta: "70.55" }],
  categorias: [{ id: "c1", nombre: "Telefonía", ventasNetas: "350.00", utilidadBruta: "70.55" }],
};

describe("armarTablero", () => {
  it("calcula márgenes y etapas con montos decimales y conserva los cortes semanales vacíos", () => {
    const tablero = armarTablero(datos);

    expect(tablero).toMatchObject({
      ventasNetas: "1000.00",
      utilidadBruta: "400.00",
      utilidadEjercicio: "250.00",
      efectivo: "875.45",
      margenBruto: "40.00",
      margenNeto: "25.00",
      ventasSemanales: [
        { etiqueta: "1", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "2", comprobantesCreditoFiscal: "300.00", consumidorFinal: "125.00" },
        { etiqueta: "3", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "4", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
        { etiqueta: "5", comprobantesCreditoFiscal: "0.00", consumidorFinal: "0.00" },
      ],
      productosRentables: [{ id: "p1", nombre: "Teléfono", utilidadBruta: "70.55" }],
      categorias: [{ id: "c1", nombre: "Telefonía", ventasNetas: "350.00", utilidadBruta: "70.55" }],
    });
    expect(tablero.etapasUtilidad.map((e) => [e.id, e.monto])).toEqual([
      ["ventas", "1000.00"],
      ["costo-ventas", "-600.00"],
      ["utilidad-bruta", "400.00"],
      ["gastos-operacion", "-130.00"],
      ["costos-financieros", "-20.00"],
      ["utilidad-ejercicio", "250.00"],
    ]);
  });

  it("devuelve porcentajes en cero cuando no hubo ventas", () => {
    const tablero = armarTablero({ ...datos, ventasNetas: "0.00" });
    expect(tablero.margenBruto).toBe("0.00");
    expect(tablero.margenNeto).toBe("0.00");
  });
});
