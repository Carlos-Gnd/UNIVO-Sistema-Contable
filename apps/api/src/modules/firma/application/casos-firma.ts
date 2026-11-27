import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { EstadoFirmadoVista, FirmarEstado } from "@contable/shared";
import { crearP12 } from "../domain/certificados.js";
import { estadoPdf, nuevoCodigoVerificacion, urlVerificacion } from "../domain/estado-pdf.js";
import { firmarPdf, huellaArchivo } from "../domain/pdf-firmado.js";
import {
  EstadoFirmadoNoEncontradoError,
  REPOSITORIO_FIRMA,
  type EstadoFirmadoGuardado,
  type RepositorioFirma,
} from "../domain/repositorio-firma.js";

const CARGO_POR_OMISION = "Contador";

const aVista = (f: EstadoFirmadoGuardado): EstadoFirmadoVista => ({
  id: f.id,
  codigoVerificacion: f.codigoVerificacion,
  titulo: f.titulo,
  periodo: f.periodo,
  firmante: f.firmante,
  cargo: f.cargo,
  firmadoEn: f.firmadoEn,
  huellaDocumento: f.huellaDocumento,
  urlVerificacion: urlVerificacion(f.codigoVerificacion),
});

/**
 * Firma digital de estados financieros (HU-87, S4-T31) y portal público de verificación (HU-88, S4-T34).
 * La autoridad simulada emite un certificado por usuario firmante; el PDF lleva la firma visible con el QR del
 * portal y la firma PAdES. El permiso estados.firmar (o estados.ver para consultar) lo exige el controlador.
 */
@Injectable()
export class CasosFirma {
  constructor(@Inject(REPOSITORIO_FIRMA) private readonly repositorio: RepositorioFirma) {}

  firmar(
    usuarioId: string,
    empresaId: string,
    datos: FirmarEstado,
  ): Promise<{ vista: EstadoFirmadoVista; pdf: Uint8Array; nombre: string }> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const empresa = await u.empresa(empresaId);
      const usuario = await u.usuario(usuarioId);
      const nombreEmpresa = empresa.nombreComercial ?? empresa.nombre;
      const certificado = await u.certificadoDeUsuario(empresaId, usuarioId, {
        nombre: usuario.nombre,
        organizacion: nombreEmpresa,
        correo: usuario.correo,
      });
      const autoridad = await u.autoridad();
      const codigo = nuevoCodigoVerificacion();
      const firmadoEn = new Date();
      const cargo = datos.cargo ?? CARGO_POR_OMISION;

      const original = await estadoPdf(datos, { empresa: empresa.nombre, nit: empresa.nit });
      const pdf = await firmarPdf(
        original,
        {
          firmante: usuario.nombre,
          cargo,
          empresa: nombreEmpresa,
          firmadoEn,
          codigoVerificacion: codigo,
          urlVerificacion: urlVerificacion(codigo),
        },
        crearP12(certificado, autoridad.certificadoPem, u.clave),
      );

      const id = randomUUID();
      const huella = huellaArchivo(pdf);
      await u.guardar({
        id,
        empresaId,
        codigoVerificacion: codigo,
        titulo: datos.titulo,
        periodo: datos.periodo,
        firmanteId: usuarioId,
        firmanteNombre: usuario.nombre,
        cargo,
        certificadoId: certificado.id,
        huellaDocumento: huella,
        firmadoEn,
        pdf,
      });
      return {
        vista: {
          id,
          codigoVerificacion: codigo,
          titulo: datos.titulo,
          periodo: datos.periodo,
          firmante: usuario.nombre,
          cargo,
          firmadoEn: firmadoEn.toISOString(),
          huellaDocumento: huella,
          urlVerificacion: urlVerificacion(codigo),
        },
        pdf,
        nombre: nombreArchivo(datos.titulo, codigo),
      };
    });
  }

  listar(usuarioId: string, empresaId: string): Promise<EstadoFirmadoVista[]> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => (await u.lista(empresaId)).map(aVista));
  }

  descargar(usuarioId: string, empresaId: string, id: string): Promise<{ pdf: Uint8Array; nombre: string }> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const firma = await u.porId(empresaId, id);
      const pdf = firma ? await u.pdf(firma.id) : null;
      if (!firma || !pdf) throw new EstadoFirmadoNoEncontradoError();
      return { pdf, nombre: nombreArchivo(firma.titulo, firma.codigoVerificacion) };
    });
  }
}

/** Nombre del archivo: «balance-general-K7Q2-9XMB-4TRA.pdf». */
function nombreArchivo(titulo: string, codigo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "estado"}-${codigo}.pdf`;
}
