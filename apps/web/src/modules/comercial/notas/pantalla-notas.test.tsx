import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type {
  DisponibleNota,
  DocumentoComercialResumen,
  NotaComercialResumen,
  NotaComercialVista,
} from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaVentas } from "../ventas/pantalla-ventas";

const E = "e1";
const PERMISOS: CodigoPermiso[] = ["operaciones.ver", "operaciones.registrar", "tesoreria.ver"];
const DOC = "55555555-5555-4555-8555-555555555555";
const SUCURSAL = "33333333-3333-4333-8333-333333333333";

const documento = (extra: Partial<DocumentoComercialResumen> = {}): DocumentoComercialResumen => ({
  id: DOC,
  operacion: "venta",
  tipoDocumento: "ccf",
  numeroDocumento: "CCF-0001",
  numeroDocumentoHasta: null,
  fecha: "2026-10-08",
  sucursalId: SUCURSAL,
  tercero: { id: "t1", nombre: "Tecno Plaza", nit: "1234-567890-123-0", nrc: "245871-4" },
  condicionPago: "credito",
  cuentaPagoId: null,
  diasCredito: 15,
  fechaVencimiento: "2026-10-23",
  totalGravado: "1000.00",
  totalExento: "0.00",
  totalNoSujeto: "0.00",
  iva: "130.00",
  ivaPercibido: "0.00",
  ivaRetenido: "0.00",
  total: "1130.00",
  totalNeto: "1130.00",
  partidaId: "p1",
  estadoPartida: "contabilizada",
  partidaCostoId: null,
  observaciones: null,
  ...extra,
});

const disponible = (): DisponibleNota => ({
  documentoId: DOC,
  saldo: "1130.00",
  lineas: [
    {
      orden: 1,
      productoId: "pr1",
      productoCodigo: "CP-01",
      descripcion: "Samsung Galaxy S24",
      clase: "gravada",
      cantidad: "4.0000",
      precioUnitario: "250.0000",
      monto: "1000.00",
      cantidadDisponible: "3.0000",
      montoDisponible: "750.00",
    },
  ],
});

const nota = (extra: Partial<NotaComercialResumen> = {}): NotaComercialResumen => ({
  id: "n1",
  operacion: "venta",
  tipo: "credito",
  motivo: "devolucion",
  numeroNota: "NC-0001",
  fecha: "2026-10-12",
  documento: { id: DOC, tipoDocumento: "ccf", numeroDocumento: "CCF-0001" },
  tercero: { id: "t1", nombre: "Tecno Plaza", nit: "1234-567890-123-0", nrc: "245871-4" },
  cuentaPagoId: null,
  totalGravado: "250.00",
  totalExento: "0.00",
  totalNoSujeto: "0.00",
  iva: "32.50",
  ivaPercibido: "0.00",
  ivaRetenido: "0.00",
  total: "282.50",
  totalNeto: "282.50",
  partidaId: "p9",
  estadoPartida: "borrador",
  partidaCostoId: "p10",
  observaciones: null,
  ...extra,
});

const base = {
  [`GET /empresas/${E}/ventas`]: { cuerpo: [documento()] },
  [`GET /empresas/${E}/cuentas`]: { cuerpo: [] },
  [`GET /empresas/${E}/cuentas-tesoreria`]: { cuerpo: [] },
  [`GET /empresas/${E}`]: { cuerpo: { id: E, clasificacion: "otro" } },
  [`GET /empresas/${E}/notas-comerciales/disponible/venta/${DOC}`]: { cuerpo: disponible() },
};

const abrir = () => renderizar(<PantallaVentas parametros={{ empresaId: E }} />, { permisos: PERMISOS });

describe("devoluciones y rebajas en ventas (HU-61, S3-T68)", () => {
  it("lista las notas registradas con su documento, motivo y estado de partida", async () => {
    simularApi({ ...base, [`GET /empresas/${E}/notas-comerciales`]: { cuerpo: [nota()] } });
    abrir();
    const fila = (await screen.findByText(/Nota de crédito NC-0001/)).closest("tr")!;
    expect(within(fila).getByText("CCF-0001")).toBeInTheDocument();
    expect(within(fila).getByText("Devolución")).toBeInTheDocument();
    expect(within(fila).getByText("Borrador")).toBeInTheDocument();
  });

  it("registra una devolución parcial: muestra lo disponible y estima el IVA y el total", async () => {
    const peticiones = simularApi({
      ...base,
      [`GET /empresas/${E}/notas-comerciales`]: { cuerpo: [] },
      [`POST /empresas/${E}/notas-comerciales`]: {
        estado: 201,
        cuerpo: { ...nota(), lineas: [] } satisfies NotaComercialVista,
      },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Devolución o rebaja" }));
    const dialogo = await screen.findByRole("dialog");

    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: /CCF-0001/ })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByLabelText("Documento de origen"), DOC);
    expect(await within(dialogo).findByText(/Disponible: 3 u\./)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Saldo pendiente del documento: US\$ 1,130\.00/)).toBeInTheDocument();

    await usuario.type(within(dialogo).getByLabelText("Número de la nota"), "nc-0001");
    await usuario.type(within(dialogo).getByLabelText("Unidades a devolver 1"), "1");
    const resumen = within(dialogo).getByText("Total de la nota").closest("div")!;
    expect(resumen).toHaveTextContent("US$ 282.50");

    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar nota" }));
    await waitFor(() =>
      expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({
        documentoId: DOC,
        tipo: "credito",
        motivo: "devolucion",
        numeroNota: "NC-0001",
        lineas: [{ lineaOrden: 1, cantidad: "1.0000" }],
      }),
    );
  });

  it("una rebaja pide el importe de cada línea", async () => {
    const peticiones = simularApi({
      ...base,
      [`GET /empresas/${E}/notas-comerciales`]: { cuerpo: [] },
      [`POST /empresas/${E}/notas-comerciales`]: { estado: 201, cuerpo: { ...nota(), lineas: [] } },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Devolución o rebaja" }));
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: /CCF-0001/ })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByLabelText("Documento de origen"), DOC);
    await usuario.click(within(dialogo).getByLabelText("Rebaja"));
    await usuario.type(within(dialogo).getByLabelText("Número de la nota"), "NC-0002");
    await usuario.type(await within(dialogo).findByLabelText("Importe a rebajar 1"), "50");
    expect(within(dialogo).getByText("Total de la nota").closest("div")).toHaveTextContent("US$ 56.50");
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar nota" }));
    await waitFor(() =>
      expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({
        motivo: "rebaja",
        lineas: [{ lineaOrden: 1, monto: "50.00" }],
      }),
    );
  });

  it("sin elegir líneas no se envía la nota y se avisa", async () => {
    const peticiones = simularApi({ ...base, [`GET /empresas/${E}/notas-comerciales`]: { cuerpo: [] } });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Devolución o rebaja" }));
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: /CCF-0001/ })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByLabelText("Documento de origen"), DOC);
    await usuario.type(within(dialogo).getByLabelText("Número de la nota"), "NC-0003");
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar nota" }));
    expect((await within(dialogo).findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });
});
