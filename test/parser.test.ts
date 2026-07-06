import { describe, expect, it } from "vitest";
import { parseSessionFile } from "../src/jsonl/parser.js";
import { linearizeMainThread, toNormalizedEvents } from "../src/jsonl/threader.js";

const FIXTURE = "fixtures/sessions/user-correction.jsonl";

describe("parser + threader", () => {
  it("skips unknown entry types loudly", () => {
    const parsed = parseSessionFile(FIXTURE);
    expect(parsed.skippedTypes["queue-operation"]).toBe(1);
    expect(parsed.entries.every((e) => e.type === "user" || e.type === "assistant")).toBe(true);
  });

  it("linearizes the main thread and drops sidechains", () => {
    const parsed = parseSessionFile(FIXTURE);
    const chain = linearizeMainThread(parsed.entries);
    expect(chain.some((e) => e.uuid === "sc1")).toBe(false);
    expect(chain[0]?.uuid).toBe("u1");
    expect(chain[chain.length - 1]?.uuid).toBe("a6");
  });

  it("normalizes events with correct origins", () => {
    const parsed = parseSessionFile(FIXTURE);
    const events = toNormalizedEvents(linearizeMainThread(parsed.entries));
    const humans = events.filter((e) => e.origin === "human");
    const tools = events.filter((e) => e.origin === "tool");
    expect(humans.length).toBe(3);
    expect(tools.length).toBeGreaterThan(0);
    // thinking blocks and empty content never appear
    for (const e of events) expect(e.blocks.length).toBeGreaterThan(0);
  });
});
