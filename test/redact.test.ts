import { describe, expect, it } from "vitest";
import { findCandidate } from "../src/extract/candidateFinder.js";
import { buildPayload } from "../src/extract/payloadBuilder.js";
import { findForbidden, redactValue } from "../src/redact/redactor.js";
import { stableStringify } from "../src/schema/submission.js";
import type { SessionMeta } from "../src/jsonl/discover.js";

const META: SessionMeta = {
  path: "fixtures/sessions/user-correction.jsonl",
  sessionId: "11111111-1111-4111-8111-111111111111",
  projectSlug: "-Users-testperson-work-demo-app",
  mtimeMs: 0,
  sizeBytes: 0,
};

describe("redaction", () => {
  it("scrubs api keys, emails, env pairs, home paths from strings", () => {
    const dirty = {
      a: "key is sk-test-abcdefghijklmnop1234 ok",
      b: "mail ops@demo.example.com",
      c: "SESSION_SECRET_KEY=supersecretvalue123",
      d: "/Users/testperson/work/demo-app/src/x.ts",
      e: "db at postgres://admin:hunter2@db.internal:5432/prod",
      f: "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123def456",
    };
    const { value, hits } = redactValue(dirty);
    const s = JSON.stringify(value);
    expect(s).not.toContain("sk-test-abcdefghijklmnop1234");
    expect(s).not.toContain("ops@demo.example.com");
    expect(s).not.toContain("supersecretvalue123");
    expect(s).not.toContain("/Users/testperson");
    expect(s).not.toContain("hunter2");
    expect(s).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(Object.keys(hits).length).toBeGreaterThanOrEqual(5);
  });

  it("PROPERTY: no forbidden shape survives in a full packaged payload", () => {
    const c = findCandidate(META)!;
    const payload = buildPayload(c, "contributor-1", "0.1.0");
    const serialized = stableStringify(payload);
    expect(findForbidden(serialized)).toEqual([]);
    // the fixture deliberately contains a leaked key and an email in the trace
    expect(serialized).not.toContain("sk-test-abcdefghijklmnop1234");
    expect(serialized).not.toContain("ops@demo-app.example.com");
    expect(serialized).not.toContain("/Users/testperson");
  });

  it("keeps structural metadata intact (allowlist)", () => {
    const c = findCandidate(META)!;
    const payload = buildPayload(c, "contributor-1", "0.1.0");
    expect(payload.source.cwd_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.source.session_id).toBe(META.sessionId);
  });
});
