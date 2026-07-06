import { createHash } from "node:crypto";
import { z } from "zod";

export const SCHEMA_VERSION = "1.0";
export const RULESET_VERSION = "1.0";

export const NormalizedBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    is_error: z.boolean(),
    content: z.string(),
  }),
]);
export type NormalizedBlock = z.infer<typeof NormalizedBlock>;

export const NormalizedEvent = z.object({
  i: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant"]),
  origin: z.enum(["human", "sdk", "tool"]),
  blocks: z.array(NormalizedBlock),
  ts: z.string().optional(),
});
export type NormalizedEvent = z.infer<typeof NormalizedEvent>;

export const DeltaHunk = z.object({
  op: z.enum(["edit", "write"]),
  old: z.string(),
  new: z.string(),
  tool_use_id: z.string(),
});
export type DeltaHunk = z.infer<typeof DeltaHunk>;

export const FinalDelta = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      hunks: z.array(DeltaHunk),
    }),
  ),
  accepted: z.boolean(),
  acceptance_evidence: z.enum([
    "contributor-confirmed",
    "no-subsequent-correction",
    "explicit-user-approval",
  ]),
});
export type FinalDelta = z.infer<typeof FinalDelta>;

export const FailureArc = z.object({
  arc_type: z.enum([
    "user-correction",
    "tool-error-loop",
    "plan-rejected",
    "repeated-edit",
  ]),
  correction_event_indices: z.array(z.number().int().nonnegative()),
  num_attempts: z.number().int().positive(),
});
export type FailureArc = z.infer<typeof FailureArc>;

export const EnvAttachment = z.discriminatedUnion("tier", [
  z.object({
    tier: z.literal("git-ref"),
    repoUrl: z.string(),
    baseRef: z.string(),
    diff: z.string(),
  }),
  z.object({
    tier: z.literal("container"),
    imageDigest: z.string(),
    setup: z.array(z.string()),
  }),
]);
export type EnvAttachment = z.infer<typeof EnvAttachment>;

export const AttestationRecord = z.object({
  scheme: z.literal("self-v1"),
  payloadSha256: z.string(),
  clientVersion: z.string(),
  signedAt: z.string(),
  signature: z.string().optional(),
});
export type AttestationRecord = z.infer<typeof AttestationRecord>;

export const SubmissionV1 = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  submission_id: z.string().uuid(),
  kind: z.literal("trace_only"),
  contributor: z.object({
    id: z.string(),
    client_version: z.string(),
  }),
  source: z.object({
    tool: z.literal("claude-code"),
    tool_version: z.string(),
    session_id: z.string(),
    model: z.string(),
    started_at: z.string(),
    ended_at: z.string(),
    cwd_fingerprint: z.string(),
    git_branch: z.string().nullable(),
    compacted: z.boolean(),
  }),
  task: z.object({
    initial_prompt: z.string(),
    followup_prompts: z.array(z.string()),
    labels: z.object({
      underspecified: z.boolean(),
      failure_arc: z.boolean(),
    }),
    language_hints: z.array(z.string()),
    contributor_summary: z.string().optional(),
  }),
  trace: z.object({
    format: z.literal("cc-jsonl-normalized-v1"),
    events: z.array(NormalizedEvent),
    stats: z.object({
      num_turns: z.number().int().nonnegative(),
      num_human_messages: z.number().int().nonnegative(),
      num_edits: z.number().int().nonnegative(),
      num_tool_errors: z.number().int().nonnegative(),
      duration_s: z.number().nonnegative(),
    }),
  }),
  final_delta: FinalDelta,
  failure_arc: FailureArc,
  env: EnvAttachment.nullable(),
  redaction: z.object({
    ruleset_version: z.string(),
    hits: z.record(z.number().int().nonnegative()),
    residual_risk_ack: z.boolean(),
  }),
  attestation: AttestationRecord.nullable(),
  consent: z
    .object({
      reviewed_full_payload: z.boolean(),
      confirmed_final_state_solved_task: z.boolean(),
      consented_at: z.string(),
      terms_version: z.string(),
    })
    .nullable(),
});
export type SubmissionV1 = z.infer<typeof SubmissionV1>;

/**
 * Canonical JSON: object keys sorted recursively. The attestation hash and the
 * server-side recomputation must both use this exact serialization.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * The attestation covers the payload with attestation and consent nulled, so
 * consent can be recorded after review without invalidating the hash. The
 * consent record separately pins `manifest = attestation.payloadSha256`.
 */
export function attestablePayloadHash(payload: SubmissionV1): string {
  return sha256Hex(
    stableStringify({ ...payload, attestation: null, consent: null }),
  );
}
