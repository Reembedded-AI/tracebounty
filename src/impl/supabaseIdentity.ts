import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadConfig, saveConfig } from "../config.js";
import type { Contributor, Identity } from "../interfaces/identity.js";

export class SupabaseIdentity implements Identity {
  private client: SupabaseClient;

  constructor() {
    const cfg = loadConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error(
        "Backend not configured. Set TRACEBOUNTY_SUPABASE_URL and TRACEBOUNTY_SUPABASE_ANON_KEY, or add supabaseUrl/supabaseAnonKey to ~/.tracebounty/config.json.",
      );
    }
    this.client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: false },
    });
  }

  async login(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({ email });
    if (error) throw new Error(`login failed: ${error.message}`);
  }

  async verify(email: string, code: string): Promise<Contributor> {
    const { data, error } = await this.client.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error || !data.session || !data.user) {
      throw new Error(`verification failed: ${error?.message ?? "no session"}`);
    }
    const cfg = loadConfig();
    cfg.session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
    cfg.contributor = { id: data.user.id, email };
    saveConfig(cfg);
    return cfg.contributor;
  }

  async currentContributor(): Promise<Contributor | null> {
    return loadConfig().contributor ?? null;
  }

  async accessToken(): Promise<string | null> {
    const cfg = loadConfig();
    if (!cfg.session) return null;
    // Refresh if the stored token is stale; magic-link sessions are long-lived
    // via refresh tokens.
    const { data, error } = await this.client.auth.setSession(cfg.session);
    if (error || !data.session) return null;
    cfg.session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
    saveConfig(cfg);
    return data.session.access_token;
  }
}
