import { calcularTotalesDocumento, type DteVista } from "@contable/shared";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { construirDte, enlaceConsulta, nuevoCodigoGeneracion, numeroControl } from "../domain/dte.js";
import { representacionGrafica } from "./representacion-grafica.js";

function vista(lineas: number, invalidado = false): DteVista {
  const codigoGeneracion = nuevoCodigoGeneracion();
  const detalle = Array.from({ length: lineas }, (_, i) => ({
    descripcion: `Teléfono modelo ${i + 1} con cargador, funda y protector de pantalla`,
    codigo: `TEL-${i + 1}`,
    cantidad: "1",
    precioUnitario: "113.00",
    monto: "113.00",
    clase: "gravada" as const,
    bien: true,
  }));
  const totales = calcularTotalesDocumento({
    operacion: "venta",
    tipoDocumento: "factura",
    lineas: detalle.map((l) => ({ monto: l.monto, clase: l.clase })),
    empresa: "otro",
    tercero: "otro",
  });
  const control = numeroControl("01", "M001", "0001", 1);
  const documento = construirDte({
    tipo: "01",
    codigoGeneracion,
    numeroControl: control,
    fecha: "2026-11-27",
    hora: "10:00:00",
    empresa: {
      nombre: "CheroPhonex",
      nombreComercial: null,
      nit: "1217-150890-101-2",
      nrc: "123456-7",
      actividadEconomica: "47411 · Venta de teléfonos",
      direccion: "San Miguel",
      telefono: "2660-0000",
      correo: "ventas@cherophonex.test",
    },
    sucursal: { codigoEstablecimiento: "M001", codigoPuntoVenta: "0001", esMatriz: true, direccion: null },
    receptor: null,
    lineas: detalle,
    totales,
    condicionPago: "contado",
    diasCredito: 0,
    observaciones: "Garantía de 6 meses",
  });
  return {
    id: "d",
    tipoDte: "01",
    nombreTipo: "Factura",
    numeroControl: control,
    codigoGeneracion,
    fechaEmision: "2026-11-27",
    horaEmision: "10:00:00",
    sucursalId: "s",
    receptor: null,
    total: totales.totalNeto,
    iva: totales.iva,
    estado: invalidado ? "invalidado" : "procesado",
    selloRecepcion: `2026${"A".repeat(36)}`,
    documentoId: "v",
    notaId: null,
    relacionado: null,
    invalidacion: invalidado
      ? { tipo: 2, motivo: "Venta rescindida", invalidadoEn: "2026-11-28T10:00:00.000Z", selloRecepcion: "x" }
      : null,
    documento,
    firma: "a.b.c",
    respuesta: {},
    enlaceConsulta: enlaceConsulta(codigoGeneracion, "2026-11-27"),
    firmaValida: true,
    evento: null,
  };
}

describe("representación gráfica del DTE", () => {
  it("genera un PDF de una página para una factura corta", async () => {
    const pdf = await PDFDocument.load(await representacionGrafica(vista(2)));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toContain("DTE-01-M0010001-000000000000001");
  });

  it("continúa en más páginas cuando el detalle es largo, también si está invalidado", async () => {
    const pdf = await PDFDocument.load(await representacionGrafica(vista(80, true)));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
