import { createInterface } from "node:readline/promises";
import type { NormalizedEvent, SubmissionV1 } from "../schema/submission.js";

export interface ConsentResult {
  approved: boolean;
  excludedEventIndices: number[];
  confirmedSolved: boolean;
}

/**
 * Full-payload review. The user sees every event that would be uploaded, can
 * exclude events, and must answer two confirmations. This is the trust
 * surface; nothing here may be automated or skipped.
 */
export async function runConsentFlow(payload: SubmissionV1): Promise<ConsentResult> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    print(renderPayloadSummary(payload));
    print("\n--- FULL TRACE (everything below would be uploaded) ---\n");
    for (const e of payload.trace.events) print(renderEvent(e));
    print("\n--- FINAL DELTA ---\n");
    for (const f of payload.final_delta.files) {
      print(`  ${f.path}`);
      for (const h of f.hunks) {
        print(`    [${h.op}] - ${truncate(h.old, 200)}`);
        print(`           + ${truncate(h.new, 200)}`);
      }
    }
    print(`\nRedaction: ruleset ${payload.redaction.ruleset_version}, hits: ${JSON.stringify(payload.redaction.hits)}`);

    const exclude = await rl.question(
      "\nEvent indices to EXCLUDE from the upload (comma-separated, empty for none): ",
    );
    const excludedEventIndices = exclude
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0);

    const reviewed = await rl.question(
      "Have you reviewed the payload above and do you consent to uploading it? (yes/no): ",
    );
    if (!isYes(reviewed)) return { approved: false, excludedEventIndices, confirmedSolved: false };

    const solved = await rl.question(
      "Did the final state of this session actually solve your task? (yes/no): ",
    );
    return { approved: true, excludedEventIndices, confirmedSolved: isYes(solved) };
  } finally {
    rl.close();
  }
}

function isYes(s: string): boolean {
  return /^y(es)?$/i.test(s.trim());
}

function print(s: string): void {
  process.stdout.write(s + "\n");
}

export function renderPayloadSummary(p: SubmissionV1): string {
  return [
    `Submission ${p.submission_id}`,
    `  kind: ${p.kind} (no repository data attached)`,
    `  session: ${p.source.session_id} model=${p.source.model} compacted=${p.source.compacted}`,
    `  arc: ${p.failure_arc.arc_type} attempts=${p.failure_arc.num_attempts}`,
    `  initial prompt: ${truncate(p.task.initial_prompt, 200)}`,
    `  followups: ${p.task.followup_prompts.length}, events: ${p.trace.events.length}, files touched: ${p.final_delta.files.length}`,
  ].join("\n");
}

function renderEvent(e: NormalizedEvent): string {
  const lines = [`[${e.i}] ${e.role}/${e.origin}`];
  for (const b of e.blocks) {
    if (b.type === "text") lines.push(`    text: ${truncate(b.text, 300)}`);
    else if (b.type === "tool_use")
      lines.push(`    tool_use ${b.name}: ${truncate(JSON.stringify(b.input), 300)}`);
    else lines.push(`    tool_result${b.is_error ? " (ERROR)" : ""}: ${truncate(b.content, 300)}`);
  }
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, " ");
  return flat.length > n ? flat.slice(0, n) + "…" : flat;
}
