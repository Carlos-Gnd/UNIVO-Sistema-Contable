import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { VerificacionEstado } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import { PantallaVerificacion } from "./pantalla-verificacion";

const CODIGO = "ABCD-2345-WXYZ";
const RUTA = `/verificacion/${CODIGO}`;
const HUELLA = "a".repeat(64);
const verificacion = (extra: Partial<VerificacionEstado> = {}): VerificacionEstado => ({
  codigoVerificacion: CODIGO,
  empresa: "Comercial Equus, S.A. de C.V.",
  nit: "0614-010190-101-1",
  titulo: "Balance general",
  periodo: "Octubre 2026",
  firmante: "Ana Contadora",
  cargo: "Contador",
  firmadoEn: "2026-11-20T15:00:00.000Z",
  certificado: {
    titular: "Ana Contadora",
    emisor: "Autoridad EQUUS",
    numeroSerie: "01AB",
    validoDesde: "2026-01-01",
    validoHasta: "2027-01-01",
  },
  huellaDocumento: HUELLA,
  integro: null,
  archivo: null,
  ...extra,
});
const pdf = (nombre = "estado.pdf") => new File(["%PDF-1.7"], nombre, { type: "application/pdf" });

const abrir = (codigo?: string) => renderizar(<PantallaVerificacion parametros={codigo ? { codigo } : {}} />);

describe("portal público de verificación (HU-88, S4-T35)", () => {
  it("sin código pide escribirlo y no consulta la API", () => {
    const peticiones = simularApi({});
    abrir();
    expect(screen.getByRole("heading", { name: "Verifica un documento" })).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("rechaza un código mal formado antes de consultar", async () => {
    const peticiones = simularApi({});
    const { usuario } = abrir();
    await usuario.type(screen.getByLabelText("Código de verificación"), "abc");
    await usuario.click(screen.getByRole("button", { name: "Verificar" }));
    expect(screen.getByText("El código debe tener el formato XXXX-XXXX-XXXX.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("muestra el estado de carga y luego los datos de la firma", async () => {
    simularApi({ ["GET " + RUTA]: { cuerpo: verificacion() } });
    abrir(CODIGO);
    expect(screen.getByRole("status")).toHaveTextContent("Consultando el código");
    expect(await screen.findByText("Firma registrada")).toBeInTheDocument();
    expect(screen.getByText("Comercial Equus, S.A. de C.V.")).toBeInTheDocument();
    expect(screen.getByText("Balance general")).toBeInTheDocument();
    expect(screen.getByText("Octubre 2026")).toBeInTheDocument();
    expect(screen.getByText("Contador")).toBeInTheDocument();
    expect(screen.getByText("20/11/2026")).toBeInTheDocument();
  });

  it("avisa cuando el código no existe", async () => {
    simularApi({ ["GET " + RUTA]: { estado: 404, cuerpo: { mensaje: "No existe" } } });
    abrir(CODIGO);
    expect(await screen.findByText("No encontramos ese código.")).toBeInTheDocument();
  });

  it("un código de la ruta con formato inválido no consulta la API", () => {
    const peticiones = simularApi({});
    abrir("hola");
    expect(screen.getByText("No encontramos ese código.")).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  it("muestra el error de la API con la opción de reintentar", async () => {
    simularApi({ ["GET " + RUTA]: { estado: 429, cuerpo: { mensaje: "Demasiadas peticiones" } } });
    abrir(CODIGO);
    expect(
      await screen.findByText(/No se pudo consultar el código\. Demasiadas peticiones/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("sube el PDF en el campo archivo y muestra que es íntegro", async () => {
    const peticiones = simularApi({
      ["GET " + RUTA]: { cuerpo: verificacion() },
      ["POST " + RUTA]: {
        cuerpo: verificacion({
          integro: true,
          archivo: { huella: HUELLA, firmaValida: true, coincideHuella: true },
        }),
      },
    });
    const { usuario } = abrir(CODIGO);
    await screen.findByText("Firma registrada");
    await usuario.upload(screen.getByLabelText("PDF del estado financiero"), pdf());
    await usuario.click(screen.getByRole("button", { name: "Comprobar PDF" }));
    expect(await screen.findByText("El PDF es íntegro")).toBeInTheDocument();
    const post = peticiones.find((p) => p.metodo === "POST");
    expect(post?.cuerpo).toBeInstanceOf(FormData);
    expect((post?.cuerpo as FormData).get("archivo")).toBeInstanceOf(File);
  });

  it("muestra que el PDF fue alterado o es de otro estado", async () => {
    simularApi({
      ["GET " + RUTA]: { cuerpo: verificacion() },
      ["POST " + RUTA]: {
        cuerpo: verificacion({
          integro: false,
          archivo: { huella: "b".repeat(64), firmaValida: false, coincideHuella: false },
        }),
      },
    });
    const { usuario } = abrir(CODIGO);
    await screen.findByText("Firma registrada");
    await usuario.upload(screen.getByLabelText("PDF del estado financiero"), pdf());
    await usuario.click(screen.getByRole("button", { name: "Comprobar PDF" }));
    expect(await screen.findByText("El PDF no es el documento firmado")).toBeInTheDocument();
    expect(screen.getByText("La huella no coincide")).toBeInTheDocument();
    expect(screen.getByText("La firma digital no es válida")).toBeInTheDocument();
  });

  it("valida el archivo antes de subirlo", async () => {
    const peticiones = simularApi({ ["GET " + RUTA]: { cuerpo: verificacion() } });
    const { usuario } = abrir(CODIGO);
    await screen.findByText("Firma registrada");
    await usuario.click(screen.getByRole("button", { name: "Comprobar PDF" }));
    expect(screen.getByText("Elige un archivo PDF.")).toBeInTheDocument();
    // El navegador filtra por accept al elegir; fireEvent simula el archivo arrastrado o forzado
    fireEvent.change(screen.getByLabelText("PDF del estado financiero"), {
      target: { files: [new File(["x"], "nota.txt", { type: "text/plain" })] },
    });
    await usuario.click(screen.getByRole("button", { name: "Comprobar PDF" }));
    await waitFor(() => expect(screen.getByText("El archivo debe ser un PDF.")).toBeInTheDocument());
    expect(peticiones.filter((p) => p.metodo === "POST")).toHaveLength(0);
  });

  it("muestra el error si falla la comprobación del PDF", async () => {
    simularApi({
      ["GET " + RUTA]: { cuerpo: verificacion() },
      ["POST " + RUTA]: { estado: 400, cuerpo: { mensaje: "Archivo no válido" } },
    });
    const { usuario } = abrir(CODIGO);
    await screen.findByText("Firma registrada");
    await usuario.upload(screen.getByLabelText("PDF del estado financiero"), pdf());
    await usuario.click(screen.getByRole("button", { name: "Comprobar PDF" }));
    expect(await screen.findByText(/No se pudo comprobar el PDF\. Archivo no válido/)).toBeInTheDocument();
  });
});
