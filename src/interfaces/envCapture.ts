import type { EnvAttachment } from "../schema/submission.js";

/**
 * Swap-later interface: v1 ships NullEnvCapture (trace-only). Later tiers
 * (git-ref for OSS repos, synthesized/container envs) attach an EnvAttachment
 * to the payload's optional `env` field; the schema never restructures.
 */
export interface EnvCapture {
  readonly tier: "none" | "git-ref" | "container";
  capture(ctx: { cwd: string; sessionId: string }): Promise<EnvAttachment | null>;
}
