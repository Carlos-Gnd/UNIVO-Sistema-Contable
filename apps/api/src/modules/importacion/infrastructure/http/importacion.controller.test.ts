import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ImportacionExcel } from "../../application/importacion-excel.js";
import { PERMISO_IMPORTAR, type RepositorioImportacion } from "../../domain/plantillas.js";
import { bombaZip, TIEMPO_LIMITE_BOMBA } from "../bomba-zip.js";
import { LibrosExcelJs, MAXIMO_BYTES_DESCOMPRIMIDOS, MENSAJE_DEMASIADO_GRANDE } from "../excel.js";
import { ImportacionController } from "./importacion.controller.js";

const EMPRESA = "6f1c2b9e-4a3d-4c8e-9b1a-2d3e4f5a6b7c";

const repositorio: RepositorioImportacion = {
  permisos: async () => new Set([PERMISO_IMPORTAR]),
  cuentas: async () => [],
};

const controlador = new ImportacionController(new ImportacionExcel(repositorio, new LibrosExcelJs()));

describe("POST validar con una bomba zip", () => {
  it(
    "responde 400 sin descomprimir el archivo entero en memoria",
    async () => {
      const archivo = await bombaZip("Saldos iniciales", 40_000);
      // Pequeño comprimido, pero muy por encima del máximo una vez descomprimido
      expect(archivo.length).toBeLessThan(1024 * 1024);

      const antes = process.memoryUsage().rss;
      const respuesta = controlador.validar({ id: "u1" } as never, EMPRESA, "saldos-iniciales", {
        buffer: archivo,
      });
      await expect(respuesta).rejects.toThrow(BadRequestException);
      await expect(respuesta).rejects.toThrow(MENSAJE_DEMASIADO_GRANDE);

      // Cargado entero con ExcelJS subía a cientos de MB; ahora se corta a poco más del máximo
      const crecimiento = process.memoryUsage().rss - antes;
      expect(crecimiento).toBeLessThan(MAXIMO_BYTES_DESCOMPRIMIDOS * 5);
      // Generar la bomba comprime unos 27 MB: con la máquina cargada pasa del límite de 5 s por defecto
    },
    TIEMPO_LIMITE_BOMBA,
  );
});
