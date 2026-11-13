import {
  BadRequestException,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UsuarioActual, type Usuario } from "../../compartido/usuario-actual.js";
import { LogoService, type LogoFile } from "./logo.service.js";

@Controller("empresas")
export class LogoController {
  constructor(private readonly logoService: LogoService) {}

  @Post(":empresaId/logo")
  @UseInterceptors(FileInterceptor("logo", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async subirLogo(
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @UploadedFile() file: LogoFile | undefined,
    @UsuarioActual() usuario: Usuario,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException("Debes adjuntar el archivo en el campo logo");
    }

    return this.logoService.subirLogo(empresaId, usuario.id, file);
  }
}
