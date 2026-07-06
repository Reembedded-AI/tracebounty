/**
 * Redaction ruleset. Every rule rewrites matches in place; hits are counted
 * per rule id into the RedactionReport. The server runs the same shapes as a
 * second-pass scan and rejects payloads with residual hits, so keep this list
 * in sync with the backend's scan list.
 */
export interface RedactionRule {
  id: string;
  pattern: RegExp;
  replace: string | ((match: string, ...groups: string[]) => string);
}

export const RULES: RedactionRule[] = [
  {
    id: "private-key-block",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: "[REDACTED:private-key]",
  },
  {
    id: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replace: "[REDACTED:aws-key]",
  },
  {
    id: "api-key-prefix",
    // known vendor key prefixes (OpenAI/Anthropic sk-, GitHub ghp_/gho_/PAT, Slack xox, Google AIza, Stripe sk_live/pk_live)
    pattern:
      /\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk_live_[A-Za-z0-9]{16,}|pk_live_[A-Za-z0-9]{16,})\b/g,
    replace: "[REDACTED:api-key]",
  },
  {
    id: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g,
    replace: "[REDACTED:jwt]",
  },
  {
    id: "bearer-token",
    pattern: /\b[Bb]earer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
    replace: "Bearer [REDACTED:token]",
  },
  {
    id: "env-secret-pair",
    // KEY=VALUE lines where the key name smells like a secret; keeps the key, drops the value
    pattern:
      /^(\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|DSN)[A-Z0-9_]*\s*=\s*)\S.*$/gm,
    replace: (_m, prefix: string) => `${prefix}[REDACTED:env-value]`,
  },
  {
    id: "connection-string",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'<>]+/g,
    replace: "[REDACTED:connection-string]",
  },
  {
    id: "email",
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g,
    replace: "[REDACTED:email]",
  },
  {
    id: "ipv4",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replace: (m) => (m === "127.0.0.1" || m === "0.0.0.0" ? m : "[REDACTED:ip]"),
  },
  {
    id: "home-path",
    pattern: /(?:\/Users|\/home)\/[A-Za-z0-9._-]+/g,
    replace: "~",
  },
];

/** Shapes that must never survive into a serialized payload (property-test surface). */
export const FORBIDDEN_SHAPES: RegExp[] = [
  /(?:\/Users|\/home)\/[A-Za-z0-9._-]+/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s"'<>]*:[^\s"'<>]*@/,
];
