import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { AnexoF07, AnexosF07Vista } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { ContenidoAnexosF07 } from "./contenido-anexos-f07";

const E = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GET = `GET /empresas/${E}/libros-iva/anexos-f07`;

const anexo = (extra: Partial<AnexoF07>): AnexoF07 => ({
  id: "compras",
  nombre: "Anexo de compras",
  archivo: "anexo-compras",
  columnas: ["Fecha", "Tipo", "Documento", "NRC", "Proveedor", "Total"],
  filas: [["05/10/2026", "CCF", "CCF-100", "123456-7", "Proveedor", "113.00"]],
  total: "113.00",
  errores: [],
  csv: "05/10/2026;CCF;CCF-100;123456-7;Proveedor;113.00\r\n",
  ...extra,
});

const vista = (anexos: AnexoF07[]): AnexosF07Vista => ({ desde: "2026-10-01", hasta: "2026-10-31", anexos });
const abrir = () =>
  renderizar(<ContenidoAnexosF07 empresaId={E} periodo="2026-10" />, { permisos: ["iva.ver"] });

afterEach(() => vi.unstubAllGlobals());

describe("anexos del F-07 (HU-51)", () => {
  it("muestra los anexos listos y habilita la descarga", async () => {
    simularApi({
      [GET]: {
        cuerpo: vista([
          anexo({}),
          anexo({ id: "contribuyentes", nombre: "Anexo de ventas a contribuyentes", total: "3096.77" }),
        ]),
      },
    });
    abrir();
    expect(await screen.findByText("Listos para cargar en el portal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar todos" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Generar CSV" })).toBeEnabled();
    expect(screen.getByText("CCF-100")).toBeInTheDocument();
  });

  it("con un campo obligatorio vacío lista el error y bloquea la exportación", async () => {
    simularApi({
      [GET]: {
        cuerpo: vista([
          anexo({
            csv: "",
            errores: [
              { fila: 1, columna: "NRC", referencia: "CCF CCF-100", mensaje: "Falta «NRC» en CCF CCF-100." },
            ],
          }),
        ]),
      },
    });
    abrir();
    expect(await screen.findByText("Falta «NRC» en CCF CCF-100.")).toBeInTheDocument();
    expect(screen.getByText("Corrija estos datos antes de exportar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar todos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generar CSV" })).toBeDisabled();
  });
});
