import { ServiceUnavailableException, Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

@Injectable()
export class SupabaseAuthService {
  private client: SupabaseClient | undefined;

  async verificarToken(accessToken: string): Promise<AuthenticatedUser | null> {
    try {
      const { data, error } = await this.getClient().auth.getClaims(accessToken);

      if (error) {
        if (error.status === undefined || error.status >= 500) {
          throw new ServiceUnavailableException(
            "El servicio de autenticación de Supabase no está disponible",
          );
        }

        return null;
      }

      if (!data) {
        return null;
      }

      const id = data.claims.sub;

      if (typeof id !== "string" || id.length === 0) {
        return null;
      }

      const email = data.claims.email;

      return typeof email === "string" ? { id, email } : { id };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException("No se pudo verificar el token con Supabase");
    }
  }

  private getClient(): SupabaseClient {
    if (this.client) {
      return this.client;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
      throw new ServiceUnavailableException("Falta configurar SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY");
    }

    this.client = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });

    return this.client;
  }
}
