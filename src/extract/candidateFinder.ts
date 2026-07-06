import type { FailureArc, NormalizedEvent } from "../schema/submission.js";
import type { SessionMeta } from "../jsonl/discover.js";
import { parseSessionFile } from "../jsonl/parser.js";
import { linearizeMainThread, toNormalizedEvents } from "../jsonl/threader.js";
import { classifyArc } from "./arcClassifier.js";
import { countEdits, erroredToolUseIds } from "./deltaBuilder.js";
import { extractPrompts } from "./promptExtractor.js";

export interface Candidate {
  meta: SessionMeta;
  events: NormalizedEvent[];
  arc: FailureArc;
  compacted: boolean;
  toolVersion: string;
  model: string;
  cwd: string;
  gitBranch: string | null;
  startedAt: string;
  endedAt: string;
  score: number;
  initialPromptPreview: string;
  numEdits: number;
  numErrors: number;
}

/**
 * A session is a candidate when it has at least one accepted edit AND a
 * classified failure arc. Sessions with no edits have no sellable delta;
 * sessions with no arc are single-shot successes, not evals.
 */
export function findCandidate(meta: SessionMeta): Candidate | null {
  const parsed = parseSessionFile(meta.path);
  const chain = linearizeMainThread(parsed.entries);
  if (chain.length === 0) return null;
  const events = toNormalizedEvents(chain);

  const numEdits = countEdits(events);
  if (numEdits === 0) return null;

  const arc = classifyArc(events);
  if (!arc) return null;

  const prompts = extractPrompts(events);
  if (!prompts.initialPrompt) return null;

  const numErrors = erroredToolUseIds(events).size;
  const first = chain[0];
  const last = chain[chain.length - 1];
  const assistant = chain.find((e) => e.type === "assistant");

  return {
    meta,
    events,
    arc,
    compacted: parsed.compacted,
    toolVersion: first?.version ?? "unknown",
    model: assistant?.message?.model ?? "unknown",
    cwd: first?.cwd ?? "",
    gitBranch: first?.gitBranch ?? null,
    startedAt: first?.timestamp ?? "",
    endedAt: last?.timestamp ?? "",
    score:
      arc.correction_event_indices.length * 3 + numErrors + Math.min(numEdits, 10) * 0.5,
    initialPromptPreview: prompts.initialPrompt.slice(0, 120),
    numEdits,
    numErrors,
  };
}

export function scanForCandidates(sessions: SessionMeta[], limit = 20): Candidate[] {
  const out: Candidate[] = [];
  for (const meta of sessions) {
    try {
      const c = findCandidate(meta);
      if (c) out.push(c);
    } catch {
      // unreadable or malformed session; skip rather than abort the scan
    }
    if (out.length >= limit * 3) break; // scan enough to rank, not everything
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
