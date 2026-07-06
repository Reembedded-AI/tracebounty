import type { NormalizedBlock, NormalizedEvent } from "../schema/submission.js";
import type { RawContentBlock, RawEntry } from "./parser.js";

/**
 * Linearize the main conversation thread. Sessions can contain sidechains
 * (subagents) and dead branches (rewinds); the live thread is the parentUuid
 * chain ending at the last non-sidechain entry.
 */
export function linearizeMainThread(entries: RawEntry[]): RawEntry[] {
  const byUuid = new Map<string, RawEntry>();
  for (const e of entries) if (e.uuid) byUuid.set(e.uuid, e);

  const main = entries.filter((e) => !e.isSidechain);
  const leaf = main[main.length - 1];
  if (!leaf) return [];

  const chain: RawEntry[] = [];
  const seen = new Set<string>();
  let cur: RawEntry | undefined = leaf;
  while (cur) {
    if (cur.uuid) {
      if (seen.has(cur.uuid)) break; // defensive: cycles must not hang us
      seen.add(cur.uuid);
    }
    if (!cur.isSidechain) chain.push(cur);
    cur = cur.parentUuid ? byUuid.get(cur.parentUuid) : undefined;
  }
  return chain.reverse();
}

/** True for user entries injected by the harness rather than typed by the human. */
function isInjected(entry: RawEntry): boolean {
  if (entry.isMeta) return true;
  if (entry.isCompactSummary) return true;
  const c = entry.message?.content;
  if (typeof c === "string") return /<system-reminder>/.test(c);
  return false;
}

export function toNormalizedEvents(chain: RawEntry[]): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];

  for (const entry of chain) {
    const role = entry.type === "assistant" ? "assistant" : "user";
    const blocks = normalizeBlocks(entry);
    if (blocks.length === 0) continue;

    const hasToolResult = blocks.some((b) => b.type === "tool_result");
    const origin: NormalizedEvent["origin"] =
      role === "assistant" ? "sdk" : hasToolResult ? "tool" : isInjected(entry) ? "sdk" : "human";

    events.push({
      i: events.length,
      role,
      origin,
      blocks,
      ts: entry.timestamp,
    });
  }
  return events;
}

function normalizeBlocks(entry: RawEntry): NormalizedBlock[] {
  const content = entry.message?.content;
  if (typeof content === "string") {
    return content.trim() ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];

  const out: NormalizedBlock[] = [];
  for (const b of content as RawContentBlock[]) {
    switch (b.type) {
      case "text":
        if (b.text?.trim()) out.push({ type: "text", text: b.text });
        break;
      case "tool_use":
        if (b.id && b.name) out.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
        break;
      case "tool_result":
        if (b.tool_use_id)
          out.push({
            type: "tool_result",
            tool_use_id: b.tool_use_id,
            is_error: b.is_error === true,
            content: flattenResultContent(b.content),
          });
        break;
      // thinking blocks are intentionally dropped: not part of the sellable trace
      default:
        break;
    }
  }
  return out;
}

function flattenResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : typeof c?.text === "string" ? c.text : ""))
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}
