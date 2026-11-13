import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { comoUsuario, type PrismaClient } from "@contable/db";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BaseDatos } from "../../compartido/base-datos.js";

export interface LogoFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
@Injectable()
export class LogoService {
  private readonly logger = new Logger(LogoService.name);
  private client: SupabaseClient | undefined;

  constructor(private readonly baseDatos: BaseDatos) {}

  async subirLogo(empresaId: string, usuarioId: string, file: LogoFile): Promise<{ url: string }> {
    this.validarArchivo(file);

    let prisma: PrismaClient;
    try {
      prisma = this.baseDatos.prisma;
    } catch {
      throw new ServiceUnavailableException("Falta configurar DATABASE_URL");
    }
    let autorizado: boolean;
    try {
      const [permiso] = await prisma.$queryRaw<{ permitido: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM permisos_usuario
          WHERE usuario_id = ${usuarioId}::uuid
            AND empresa_id = ${empresaId}::uuid
            AND permiso = 'empresa.configurar'
        ) AS permitido`;
      autorizado = permiso?.permitido === true;
    } catch {
      throw new ServiceUnavailableException("No se pudo verificar el permiso en la base de datos");
    }

    if (!autorizado) {
      throw new ForbiddenException("No tiene permiso para configurar esta empresa");
    }

    const client = this.getClient();
    const bucket = process.env.SUPABASE_LOGOS_BUCKET ?? "logos";
    const extension = EXTENSIONS[file.mimetype];
    const path = empresaId + "/" + randomUUID() + "." + extension;
    let errorSubida: { message: string } | null;
    try {
      const result = await client.storage.from(bucket).upload(path, file.buffer, {
        cacheControl: "3600",
        contentType: file.mimetype,
        upsert: false,
      });
      errorSubida = result.error;
    } catch {
      throw new ServiceUnavailableException("No se pudo guardar el logotipo en Supabase Storage");
    }

    if (errorSubida) {
      throw new ServiceUnavailableException("No se pudo guardar el logotipo en Supabase Storage");
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    const url = data.publicUrl + "?v=" + Date.now();
    let logoAnterior: string | null;

    try {
      logoAnterior = await comoUsuario(prisma, usuarioId, async (tx) => {
        const [permiso] = await tx.$queryRaw<{ permitido: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM permisos_usuario
            WHERE usuario_id = ${usuarioId}::uuid
              AND empresa_id = ${empresaId}::uuid
              AND permiso = 'empresa.configurar'
          ) AS permitido`;

        if (!permiso?.permitido) {
          throw new ForbiddenException("No tiene permiso para configurar esta empresa");
        }

        const empresa = await tx.empresa.findUnique({
          where: { id: empresaId },
          select: { logoUrl: true },
        });

        if (!empresa) {
          throw new NotFoundException("No se encontró la empresa");
        }

        await tx.empresa.update({ where: { id: empresaId }, data: { logoUrl: url } });
        return empresa.logoUrl;
      });
    } catch (error) {
      await this.eliminarArchivo(client, bucket, path);
      if (error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      throw new ServiceUnavailableException("No se pudo guardar la URL del logotipo en la empresa");
    }

    const pathAnterior = this.obtenerRutaAnterior(logoAnterior, supabaseUrl, bucket, empresaId);
    if (pathAnterior && pathAnterior !== path) {
      await this.eliminarArchivo(client, bucket, pathAnterior);
    }

    return { url };
  }

  private validarArchivo(file: LogoFile): void {
    if (
      !file ||
      file.size === 0 ||
      file.size > MAX_LOGO_SIZE ||
      file.buffer.byteLength === 0 ||
      file.buffer.byteLength > MAX_LOGO_SIZE ||
      !LOGO_MIME_TYPES.has(file.mimetype)
    ) {
      throw new BadRequestException("El logotipo debe ser PNG, JPG o WebP y no superar 2 MB");
    }

    const bytes = file.buffer;
    const esPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const esJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const esWebp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    const tipoValido =
      (file.mimetype === "image/png" && esPng) ||
      (file.mimetype === "image/jpeg" && esJpeg) ||
      (file.mimetype === "image/webp" && esWebp);

    if (!tipoValido) {
      throw new BadRequestException("El contenido del archivo no coincide con su tipo de imagen");
    }
  }

  private obtenerRutaAnterior(
    logoUrl: string | null,
    supabaseUrl: string,
    bucket: string,
    empresaId: string,
  ): string | null {
    const baseUrl = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl;
    const prefix = baseUrl + "/storage/v1/object/public/" + bucket + "/";
    if (!logoUrl?.startsWith(prefix)) {
      return null;
    }

    try {
      const path = decodeURIComponent(logoUrl.slice(prefix.length).split("?")[0] ?? "");
      return path.startsWith(empresaId + "/") ? path : null;
    } catch {
      return null;
    }
  }

  private async eliminarArchivo(client: SupabaseClient, bucket: string, path: string): Promise<void> {
    const { error } = await client.storage.from(bucket).remove([path]);
    if (error) {
      this.logger.warn("No se pudo eliminar el archivo de logotipo: " + path);
    }
  }

  private getClient(): SupabaseClient {
    if (this.client) {
      return this.client;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !secretKey) {
      throw new ServiceUnavailableException("Falta configurar SUPABASE_URL o SUPABASE_SECRET_KEY");
    }

    this.client = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });

    return this.client;
  }
}
