import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { comoUsuario, type PrismaClient } from "@contable/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { InvitarUsuario } from "@contable/shared";
import { BaseDatos } from "../../compartido/base-datos.js";
import { exigirPermisoEmpresa } from "./application/acceso-organizacion.js";

type DatosInvitacion = Pick<InvitarUsuario, "correo" | "rol" | "sucursales">;

@Injectable()
export class InvitacionService {
  private readonly logger = new Logger(InvitacionService.name);
  private cliente: SupabaseClient | undefined;

  constructor(private readonly baseDatos: BaseDatos) {}

  async invitar(
    empresaId: string,
    usuarioId: string,
    datos: DatosInvitacion,
  ): Promise<{ mensaje: string; invitacionEnviada: boolean }> {
    let prisma: PrismaClient;
    try {
      prisma = this.baseDatos.prisma;
    } catch {
      throw new ServiceUnavailableException("Falta configurar DATABASE_URL");
    }

    await exigirPermisoEmpresa(
      prisma,
      empresaId,
      usuarioId,
      "usuarios.gestionar",
      "No tiene permiso para invitar usuarios a esta empresa",
    );

    let usuario = await prisma.usuario.findFirst({
      where: { correo: { equals: datos.correo, mode: "insensitive" } },
      select: { id: true },
    });
    let authUsuarioId: string | undefined;
    let invitacionEnviada = false;

    if (!usuario) {
      const { data, error } = await this.invitarEnSupabase(datos.correo);
      if (error) {
        if (error.status === 422 || error.status === 409) {
          throw new ConflictException(
            "No se pudo enviar la invitaci\u00f3n; el correo ya tiene una cuenta o invitaci\u00f3n pendiente",
          );
        }
        throw new ServiceUnavailableException("Supabase no pudo enviar la invitaci\u00f3n");
      }
      if (!data.user?.id)
        throw new ServiceUnavailableException("Supabase no devolvi\u00f3 el usuario invitado");
      authUsuarioId = data.user.id;
      usuario = { id: authUsuarioId };
      invitacionEnviada = true;
    }

    try {
      await comoUsuario(prisma, usuarioId, async (tx) => {
        await exigirPermisoEmpresa(
          tx,
          empresaId,
          usuarioId,
          "usuarios.gestionar",
          "No tiene permiso para invitar usuarios a esta empresa",
        );

        const membresiaExistente = await tx.membresia.findUnique({
          where: { usuarioId_empresaId: { usuarioId: usuario!.id, empresaId } },
          select: { id: true },
        });
        if (membresiaExistente) {
          throw new ConflictException("El usuario ya pertenece a esta empresa");
        }

        const rol = await tx.rol.findUnique({ where: { codigo: datos.rol }, select: { id: true } });
        if (!rol)
          throw new ServiceUnavailableException("No se encontr\u00f3 el rol solicitado en la base de datos");

        if (datos.sucursales.length > 0) {
          const sucursales = await tx.$queryRaw<{ cantidad: number }[]>`
            SELECT count(*)::int AS cantidad
            FROM sucursales
            WHERE empresa_id = ${empresaId}::uuid
              AND activa
              AND id = ANY(${datos.sucursales}::uuid[])`;
          if (sucursales[0]?.cantidad !== datos.sucursales.length) {
            throw new BadRequestException(
              "Una o m\u00e1s sucursales no pertenecen a la empresa o est\u00e1n inactivas",
            );
          }
        }

        if (authUsuarioId) {
          await tx.usuario.create({
            data: {
              id: authUsuarioId,
              correo: datos.correo,
              nombre: datos.correo.split("@")[0] ?? datos.correo,
            },
          });
        }

        const membresia = await tx.membresia.create({
          data: {
            usuarioId: usuario!.id,
            empresaId,
            rolId: rol.id,
            todasSucursales: datos.rol === "administrador" || datos.rol === "contador",
          },
          select: { id: true },
        });

        if (datos.sucursales.length > 0) {
          await tx.membresiaSucursal.createMany({
            data: datos.sucursales.map((sucursalId) => ({ membresiaId: membresia.id, sucursalId })),
          });
        }
      });
    } catch (error) {
      if (authUsuarioId) await this.eliminarUsuarioAuth(authUsuarioId);
      if (
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      if (this.esDuplicado(error)) throw new ConflictException("El usuario ya pertenece a esta empresa");
      if (error instanceof ServiceUnavailableException || error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException("No se pudo guardar la membresia del usuario");
    }

    return {
      mensaje: invitacionEnviada
        ? "Invitaci\u00f3n enviada y usuario agregado a la empresa."
        : "Usuario agregado a la empresa.",
      invitacionEnviada,
    };
  }

  private async invitarEnSupabase(correo: string) {
    try {
      const webUrl = process.env.WEB_URL;
      if (!webUrl) throw new ServiceUnavailableException("Falta configurar WEB_URL");
      return await this.getClient().auth.admin.inviteUserByEmail(correo, {
        redirectTo: webUrl.replace(/\/$/, "") + "/cambiar-contrasena",
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("No se pudo enviar la invitaci\u00f3n desde Supabase");
    }
  }

  private async eliminarUsuarioAuth(id: string): Promise<void> {
    try {
      const { error } = await this.getClient().auth.admin.deleteUser(id);
      if (error) this.logger.warn("No se pudo revertir el usuario invitado en Supabase Auth");
    } catch {
      this.logger.warn("No se pudo revertir el usuario invitado en Supabase Auth");
    }
  }

  private esDuplicado(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
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
