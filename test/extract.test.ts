import { describe, expect, it } from "vitest";
import { findCandidate } from "../src/extract/candidateFinder.js";
import { buildPayload } from "../src/extract/payloadBuilder.js";
import type { SessionMeta } from "../src/jsonl/discover.js";

const META: SessionMeta = {
  path: "fixtures/sessions/user-correction.jsonl",
  sessionId: "11111111-1111-4111-8111-111111111111",
  projectSlug: "-Users-testperson-work-demo-app",
  mtimeMs: 0,
  sizeBytes: 0,
};

describe("extraction", () => {
  it("finds a user-correction candidate", () => {
    const c = findCandidate(META);
    expect(c).not.toBeNull();
    expect(c!.arc.arc_type).toBe("user-correction");
    expect(c!.numEdits).toBe(3);
  });

  it("builds the final delta last-write-wins per file", () => {
    const c = findCandidate(META)!;
    const payload = buildPayload(c, "contributor-1", "0.1.0");
    const paths = payload.final_delta.files.map((f) => f.path);
    // cwd rewritten to project-relative "."
    expect(paths).toContain("./src/auth/session.ts");
    expect(paths).toContain("./src/auth/refresh.ts");
    const session = payload.final_delta.files.find((f) => f.path === "./src/auth/session.ts")!;
    expect(session.hunks.length).toBe(2); // both edits kept in order
  });

  it("extracts prompts with initial + followups", () => {
    const c = findCandidate(META)!;
    const payload = buildPayload(c, "contributor-1", "0.1.0");
    expect(payload.task.initial_prompt).toMatch(/login timeout/);
    expect(payload.task.followup_prompts.length).toBe(2);
    expect(payload.trace.stats.num_human_messages).toBe(3);
  });
});
