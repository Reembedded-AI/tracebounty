import { RULESET_VERSION } from "../schema/submission.js";
import { FORBIDDEN_SHAPES, RULES } from "./rules.js";

export interface RedactionReport {
  ruleset_version: string;
  hits: Record<string, number>;
  residual_risk_ack: boolean;
}

/**
 * Keys whose string values are structural metadata (hashes, ids, enum-ish
 * fields) and must not be rewritten. Everything else, including every string
 * inside trace events, prompts, and delta hunks, gets the full ruleset.
 */
const ALLOWLISTED_KEYS = new Set([
  "submission_id",
  "cwd_fingerprint",
  "payloadSha256",
  "tool_use_id",
  "id",
  "session_id",
  "schema_version",
  "ruleset_version",
  "signedAt",
  "consented_at",
  "started_at",
  "ended_at",
  "ts",
]);

export function redactValue<T>(value: T, cwd?: string): { value: T; hits: Record<string, number> } {
  const hits: Record<string, number> = {};
  const out = walk(value, hits, cwd) as T;
  return { value: out, hits };
}

function walk(node: unknown, hits: Record<string, number>, cwd?: string): unknown {
  if (typeof node === "string") return redactString(node, hits, cwd);
  if (Array.isArray(node)) return node.map((n) => walk(n, hits, cwd));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = ALLOWLISTED_KEYS.has(k) && typeof v === "string" ? v : walk(v, hits, cwd);
    }
    return out;
  }
  return node;
}

function redactString(s: string, hits: Record<string, number>, cwd?: string): string {
  let out = s;
  // Project paths first: the concrete cwd becomes ".", so file paths stay
  // meaningful (project-relative) instead of collapsing into "~/...".
  if (cwd && cwd.length > 1) {
    const before = out;
    out = out.split(cwd).join(".");
    if (out !== before) hits["cwd-path"] = (hits["cwd-path"] ?? 0) + 1;
  }
  for (const rule of RULES) {
    let count = 0;
    out = out.replace(rule.pattern, (...args) => {
      count++;
      const match = args[0] as string;
      const groups = args.slice(1, -2) as string[];
      return typeof rule.replace === "string" ? rule.replace : rule.replace(match, ...groups);
    });
    if (count > 0) hits[rule.id] = (hits[rule.id] ?? 0) + count;
  }
  return out;
}

/** Second-pass verification used by tests and mirrored by the server. */
export function findForbidden(serialized: string): string[] {
  return FORBIDDEN_SHAPES.filter((p) => p.test(serialized)).map((p) => p.source);
}

export function buildReport(hits: Record<string, number>): RedactionReport {
  return { ruleset_version: RULESET_VERSION, hits, residual_risk_ack: false };
}
