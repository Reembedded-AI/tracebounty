import type { FailureArc, NormalizedEvent } from "../schema/submission.js";
import { erroredToolUseIds } from "./deltaBuilder.js";
import { extractPrompts, isCorrection } from "./promptExtractor.js";

/**
 * Classify the failure arc in a session, or null when the session shows no
 * failure signal worth selling (single-shot successes are not evals).
 */
export function classifyArc(events: NormalizedEvent[]): FailureArc | null {
  const prompts = extractPrompts(events);
  const correctionIndices = prompts.humanEventIndices.filter((i) => {
    const e = events[i];
    const text = e.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    return isCorrection(text);
  });

  const numErrors = erroredToolUseIds(events).size;
  const editTargets = editPathSequence(events);
  const repeatedEditPaths = new Set(
    editTargets.filter((p, idx) => editTargets.indexOf(p) !== idx),
  );

  if (correctionIndices.length > 0) {
    return {
      arc_type: "user-correction",
      correction_event_indices: correctionIndices,
      num_attempts: correctionIndices.length + 1,
    };
  }
  if (numErrors >= 2) {
    return {
      arc_type: "tool-error-loop",
      correction_event_indices: [],
      num_attempts: numErrors,
    };
  }
  if (repeatedEditPaths.size > 0 && editTargets.length >= 3) {
    return {
      arc_type: "repeated-edit",
      correction_event_indices: [],
      num_attempts: editTargets.length,
    };
  }
  return null;
}

function editPathSequence(events: NormalizedEvent[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    for (const b of e.blocks) {
      if (b.type !== "tool_use") continue;
      if (b.name !== "Edit" && b.name !== "Write" && b.name !== "MultiEdit") continue;
      const p = (b.input as Record<string, unknown> | undefined)?.file_path;
      if (typeof p === "string") out.push(p);
    }
  }
  return out;
}
