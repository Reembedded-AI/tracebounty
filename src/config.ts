import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  supabaseUrl: string;
  supabaseAnonKey: string;
  session?: {
    access_token: string;
    refresh_token: string;
  };
  contributor?: { id: string; email: string };
}

const DEFAULTS: Config = {
  // Filled in when the backend project is provisioned; overridable via env
  // for self-hosters and development.
  supabaseUrl: process.env.TRACEBOUNTY_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.TRACEBOUNTY_SUPABASE_ANON_KEY ?? "",
};

export function configDir(): string {
  return process.env.TRACEBOUNTY_CONFIG_DIR ?? join(homedir(), ".tracebounty");
}

export function pendingDir(): string {
  const d = join(configDir(), "pending");
  mkdirSync(d, { recursive: true });
  return d;
}

export function loadConfig(): Config {
  const p = join(configDir(), "config.json");
  if (!existsSync(p)) return { ...DEFAULTS };
  const onDisk = JSON.parse(readFileSync(p, "utf8")) as Partial<Config>;
  return { ...DEFAULTS, ...onDisk };
}

export function saveConfig(cfg: Config): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(join(configDir(), "config.json"), JSON.stringify(cfg, null, 2), {
    mode: 0o600,
  });
}
