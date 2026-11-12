import { ServiceUnavailableException, Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

@Injectable()
export class SupabaseAuthService {
  private client: SupabaseClient | undefined;

  async verificarToken(accessToken: string): Promise<User | null> {
    try {
      const { data, error } = await this.getClient().auth.getUser(accessToken);

      if (error) {
        if (error.status === undefined || error.status >= 500) {
          throw new ServiceUnavailableException(
            "El servicio de autenticación de Supabase no está disponible",
          );
        }

        return null;
      }

      return data.user;
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
