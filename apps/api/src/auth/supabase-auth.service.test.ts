import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SupabaseAuthService } from "./supabase-auth.service.js";

describe("SupabaseAuthService", () => {
  it("responde 503 cuando falta la configuración de Supabase", async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;

    try {
      await expect(new SupabaseAuthService().verificarToken("token")).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    } finally {
      if (supabaseUrl === undefined) {
        delete process.env.SUPABASE_URL;
      } else {
        process.env.SUPABASE_URL = supabaseUrl;
      }

      if (publishableKey === undefined) {
        delete process.env.SUPABASE_PUBLISHABLE_KEY;
      } else {
        process.env.SUPABASE_PUBLISHABLE_KEY = publishableKey;
      }
    }
  });
});
