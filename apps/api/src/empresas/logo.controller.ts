import {
  BadRequestException,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AuthenticatedUser } from "../auth/supabase-auth.service.js";
import { LogoService, type LogoFile } from "./logo.service.js";

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

@Controller("empresas")
export class LogoController {
  constructor(private readonly logoService: LogoService) {}

  @Post(":empresaId/logo")
  @UseInterceptors(FileInterceptor("logo", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async subirLogo(
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @UploadedFile() file: LogoFile | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException("Debes adjuntar el archivo en el campo logo");
    }

    if (!request.user) {
      throw new BadRequestException("No se encontró el usuario autenticado");
    }

    return this.logoService.subirLogo(empresaId, request.user.id, file);
  }
}
