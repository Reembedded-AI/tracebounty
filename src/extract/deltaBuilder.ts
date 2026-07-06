import type { DeltaHunk, FinalDelta, NormalizedEvent } from "../schema/submission.js";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

interface EditRecord {
  path: string;
  hunk: DeltaHunk;
}

/**
 * Fold Edit/Write tool calls into the final per-file delta. Only tool calls
 * whose result was not an error count; a Write replaces all prior hunks for
 * that file (last-write-wins), Edits accumulate in order.
 */
export function buildFinalDelta(events: NormalizedEvent[]): FinalDelta {
  const errored = erroredToolUseIds(events);
  const perFile = new Map<string, DeltaHunk[]>();

  for (const rec of collectEdits(events)) {
    if (errored.has(rec.hunk.tool_use_id)) continue;
    if (rec.hunk.op === "write") {
      perFile.set(rec.path, [rec.hunk]);
    } else {
      const hunks = perFile.get(rec.path) ?? [];
      hunks.push(rec.hunk);
      perFile.set(rec.path, hunks);
    }
  }

  return {
    files: [...perFile.entries()].map(([path, hunks]) => ({ path, hunks })),
    accepted: true, // heuristic; upgraded or overridden during consent review
    acceptance_evidence: "no-subsequent-correction",
  };
}

export function erroredToolUseIds(events: NormalizedEvent[]): Set<string> {
  const errored = new Set<string>();
  for (const e of events)
    for (const b of e.blocks)
      if (b.type === "tool_result" && b.is_error) errored.add(b.tool_use_id);
  return errored;
}

function collectEdits(events: NormalizedEvent[]): EditRecord[] {
  const out: EditRecord[] = [];
  for (const e of events) {
    for (const b of e.blocks) {
      if (b.type !== "tool_use" || !EDIT_TOOLS.has(b.name)) continue;
      const input = (b.input ?? {}) as Record<string, unknown>;
      const path = typeof input.file_path === "string" ? input.file_path : undefined;
      if (!path) continue;

      if (b.name === "Write") {
        out.push({
          path,
          hunk: { op: "write", old: "", new: String(input.content ?? ""), tool_use_id: b.id },
        });
      } else if (b.name === "MultiEdit" && Array.isArray(input.edits)) {
        for (const ed of input.edits as Array<Record<string, unknown>>) {
          out.push({
            path,
            hunk: {
              op: "edit",
              old: String(ed.old_string ?? ""),
              new: String(ed.new_string ?? ""),
              tool_use_id: b.id,
            },
          });
        }
      } else if (b.name === "Edit" || b.name === "NotebookEdit") {
        out.push({
          path,
          hunk: {
            op: "edit",
            old: String(input.old_string ?? ""),
            new: String(input.new_string ?? ""),
            tool_use_id: b.id,
          },
        });
      }
    }
  }
  return out;
}

export function countEdits(events: NormalizedEvent[]): number {
  let n = 0;
  for (const e of events)
    for (const b of e.blocks) if (b.type === "tool_use" && EDIT_TOOLS.has(b.name)) n++;
  return n;
}
