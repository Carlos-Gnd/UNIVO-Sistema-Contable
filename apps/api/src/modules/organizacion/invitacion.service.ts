import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { comoUsuario, type PrismaClient } from "@contable/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BaseDatos } from "../../compartido/base-datos.js";

@Injectable()
export class InvitacionService {
  private cliente: SupabaseClient | undefined;

  constructor(private readonly baseDatos: BaseDatos) {}

  async invitar(empresaId: string, usuarioId: string, correo: string): Promise<{ mensaje: string }> {
    let prisma: PrismaClient;
    try {
      prisma = this.baseDatos.prisma;
    } catch {
      throw new ServiceUnavailableException("Falta configurar DATABASE_URL");
    }

    let acceso: { permitido: boolean; empresa_activa: boolean }[];
    try {
      acceso = await comoUsuario(
        prisma,
        usuarioId,
        (tx) => tx.$queryRaw<{ permitido: boolean; empresa_activa: boolean }[]>`
        SELECT
          EXISTS (
            SELECT 1 FROM permisos_usuario
            WHERE usuario_id = ${usuarioId}::uuid
              AND empresa_id = ${empresaId}::uuid
              AND permiso = 'usuarios.gestionar'
          ) AS permitido,
          EXISTS (
            SELECT 1 FROM empresas
            WHERE id = ${empresaId}::uuid AND activa
          ) AS empresa_activa`,
      );
    } catch {
      throw new ServiceUnavailableException("No se pudo verificar el acceso a la empresa");
    }

    if (!acceso[0]?.permitido) {
      throw new ForbiddenException("No tiene permiso para invitar usuarios a esta empresa");
    }
    if (!acceso[0]?.empresa_activa) {
      throw new NotFoundException("No se encontro una empresa activa");
    }

    try {
      const { error } = await this.getClient().auth.admin.inviteUserByEmail(correo);
      if (error) {
        if (error.status === 422 || error.status === 409) {
          throw new ConflictException(
            "No se pudo invitar el correo; puede que ya tenga una cuenta o invitacion pendiente",
          );
        }
        throw new ServiceUnavailableException("Supabase no pudo enviar la invitaciÃ³n");
      }
    } catch (error) {
      if (error instanceof ConflictException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("No se pudo enviar la invitaciÃ³n desde Supabase");
    }

    return { mensaje: "Invitacion enviada al correo indicado." };
  }

  private getClient(): SupabaseClient {
    if (this.cliente) return this.cliente;

    const supabaseUrl = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !secretKey) {
      throw new ServiceUnavailableException("Falta configurar SUPABASE_URL o SUPABASE_SECRET_KEY");
    }

    this.cliente = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    return this.cliente;
  }
}
