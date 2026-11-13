import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  private client: SupabaseClient | undefined;

  async subirLogo(empresaId: string, usuarioId: string, file: LogoFile): Promise<{ url: string }> {
    this.validarArchivo(file);

    const client = this.getClient();
    const { data: membresia, error: errorMembresia } = await client
      .from("membresias")
      .select("id, rol:roles!inner(codigo)")
      .eq("empresa_id", empresaId)
      .eq("usuario_id", usuarioId)
      .eq("activa", true)
      .maybeSingle();

    if (errorMembresia) {
      throw new ServiceUnavailableException("No se pudo verificar el acceso a la empresa");
    }

    const rol = membresia?.rol as { codigo?: string } | null;
    if (!membresia || rol?.codigo !== "administrador") {
      throw new ForbiddenException("Solo el administrador de la empresa puede subir su logotipo");
    }

    const bucket = process.env.SUPABASE_LOGOS_BUCKET ?? "logos";
    const extension = EXTENSIONS[file.mimetype];
    const path = `${empresaId}/${randomUUID()}.${extension}`;
    const { error } = await client.storage.from(bucket).upload(path, file.buffer, {
      cacheControl: "3600",
      contentType: file.mimetype,
      upsert: false,
    });

    if (error) {
      throw new ServiceUnavailableException("No se pudo guardar el logotipo en Supabase Storage");
    }

    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl };
  }

  private validarArchivo(file: LogoFile): void {
    if (!file || file.size === 0 || file.size > MAX_LOGO_SIZE || !LOGO_MIME_TYPES.has(file.mimetype)) {
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
